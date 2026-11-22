"""Web backend: streams the live set to the browser over a WebSocket.

Protocol (one WebSocket per listener, each gets its own engine):

  client -> server (JSON text)
    {"type": "pull"}                       render + send the next bar
    {"type": "bpm", "value": 140}          take over the tempo (glides live)
    {"type": "bpm_auto"}                   give the tempo back to the DJ
    {"type": "next"}                       quick mix into the next track
    {"type": "style", "value": "ebm"|null} lock a style (null = auto)
    {"type": "mix", "channels": {...}}     DJ channel faders (kick/drums/bass/synths/atmos, 0..1.5)
    {"type": "perform", "action": "build"|"drop"|"breakdown"}
    {"type": "loop", "bars": 0|1|2|4}      loop the last N bars (0 = off)

  server -> client
    JSON text  {"type": "hello"|"state", ...}
    binary     one bar:  [uint32 LE json length][json meta][pad to even][int16 LE stereo interleaved PCM]

The browser pulls bars just ahead of playback, so live controls are heard
within a bar or two and the music never stops.
"""

import argparse
import asyncio
import ctypes
import gc
import json
import os
import struct
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from .engine import BPM_RANGE, Engine
from .style import STYLES
from .synth import SR

WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"

app = FastAPI(title="fhmusic")

# Rendering churns through lots of short-lived numpy buffers, and glibc keeps freed
# memory in its arenas instead of returning it to the OS. Together with engines left
# in reference cycles, this let the container sit at ~1 GB on Railway after listeners
# had left. malloc_trim hands the memory back. No-op off glibc (e.g. macOS in local dev).
TRIM_EVERY_BARS = 32
try:
    _malloc_trim = ctypes.CDLL("libc.so.6").malloc_trim
except (OSError, AttributeError):
    _malloc_trim = None


def trim_memory(collect: bool = False) -> None:
    if collect:
        # an Engine sits in reference cycles, so dropping the last reference doesn't free it;
        # numpy work makes few Python objects, so a full GC pass would otherwise rarely run.
        gc.collect()
    if _malloc_trim is not None:
        _malloc_trim(0)


def pack_bar(meta: dict, audio: np.ndarray) -> bytes:
    head = json.dumps(meta, separators=(",", ":")).encode()
    pad = b" " * (len(head) % 2)  # keep PCM 2-byte aligned
    pcm = (np.clip(audio.T, -1, 1) * 32767).astype("<i2").tobytes()
    return struct.pack("<I", len(head) + len(pad)) + head + pad + pcm


def state(engine: Engine) -> dict:
    return {"type": "state", "target_bpm": engine.target_bpm, "bpm_locked": engine.user_bpm is not None,
            "locked_style": engine.locked_style}


@app.websocket("/ws")
async def stream(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()
    engine = await loop.run_in_executor(None, Engine)
    bar_id = 0
    await ws.send_json({**state(engine), "type": "hello", "sample_rate": SR, "bpm_range": BPM_RANGE,
                        "styles": [{"key": k, "name": s.name, "bpm": s.bpm} for k, s in STYLES.items()]})
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "pull":
                audio = await loop.run_in_executor(None, engine.render_bar)
                bar_id += 1
                if bar_id % TRIM_EVERY_BARS == 0:
                    await loop.run_in_executor(None, trim_memory)
                await ws.send_bytes(pack_bar(dict(engine.last_status, id=bar_id), audio))
                continue
            if kind == "bpm":
                engine.command("bpm", float(msg["value"]))
                engine.target_bpm = float(np.clip(float(msg["value"]), *BPM_RANGE))  # for instant feedback
                engine.user_bpm = engine.target_bpm
            elif kind == "bpm_auto":
                engine.command("bpm_auto")
                engine.user_bpm = None
            elif kind == "next":
                engine.command("next")
            elif kind == "mix":
                engine.command("mix", {k: float(v) for k, v in dict(msg.get("channels", {})).items()})
                continue
            elif kind == "perform":
                engine.command("perform", str(msg.get("action")))
                continue
            elif kind == "loop":
                engine.command("loop", int(msg.get("bars", 0)))
                continue
            elif kind == "style":
                value = msg.get("value")
                engine.command("style", value if value in STYLES else None)
                engine.locked_style = value if value in STYLES else None
            await ws.send_json(state(engine))
    except WebSocketDisconnect:
        pass
    finally:
        del engine  # free this listener's buses and caches, then hand the memory back
        await loop.run_in_executor(None, trim_memory, True)


if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")


def main() -> None:
    ap = argparse.ArgumentParser(description="fhmusic web app")
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))  # hosts like Railway set PORT
    args = ap.parse_args()
    if not WEB_DIST.exists():
        print("web/dist not found: serving the /ws stream only (build web/ to also serve the app here)")
    print(f"fhmusic → http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
