"""Web backend: streams the live set to the browser over a WebSocket.

Protocol (one WebSocket per listener, each gets its own engine):

  client -> server (JSON text)
    {"type": "pull"}                       render + send the next bar
    {"type": "bpm", "value": 140}          take over the tempo (glides live)
    {"type": "bpm_auto"}                   give the tempo back to the DJ
    {"type": "next"}                       quick mix into the next track
    {"type": "style", "value": "ebm"|null} lock a style (null = auto)

  server -> client
    JSON text  {"type": "hello"|"state", ...}
    binary     one bar:  [uint32 LE json length][json meta][pad to even][int16 LE stereo interleaved PCM]

The browser pulls bars just ahead of playback, so live controls are heard
within a bar or two and the music never stops.
"""

import argparse
import asyncio
import json
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
            elif kind == "style":
                value = msg.get("value")
                engine.command("style", value if value in STYLES else None)
                engine.locked_style = value if value in STYLES else None
            await ws.send_json(state(engine))
    except WebSocketDisconnect:
        pass


if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")


def main() -> None:
    ap = argparse.ArgumentParser(description="fhmusic web app")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    if not WEB_DIST.exists():
        print("⚠  web/dist not found -- build the frontend first:  cd web && npm install && npm run build")
    print(f"fhmusic → http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
