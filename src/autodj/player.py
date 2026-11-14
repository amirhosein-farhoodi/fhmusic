"""Real-time playback: a producer thread renders bars ahead, the audio
callback streams them to the sound card without gaps."""

import queue
import sys
import threading
import time

import numpy as np
import sounddevice as sd

from .engine import Engine
from .synth import SR


def format_status(s: dict) -> str:
    e = int(round(s["energy"] * 8))
    meter = "█" * e + "·" * (8 - e)
    line = (f"#{s['track_no']} {s['track']} [{s['style']}, {s['key']}] │ {s['section']} "
            f"{s['bar']}/{s['bars']} │ {s['bpm']:.1f} BPM │ {meter}")
    if s.get("next"):
        line += f" │ mixing in → {s['next']}"
    return line


def format_layers(s: dict) -> str:
    return "  playing: " + " ".join(s["layers"])


class Player:
    def __init__(self, engine: Engine, device=None, ahead_bars: int = 3):
        self.engine = engine
        self.device = device
        self.q: queue.Queue = queue.Queue(maxsize=ahead_bars)
        self.stop = threading.Event()
        self.cur = np.zeros((0, 2), dtype=np.float32)
        self.idx = 0
        self.now_playing: dict | None = None
        self.underruns = 0

    def _produce(self):
        while not self.stop.is_set():
            audio = self.engine.render_bar()
            item = (np.ascontiguousarray(audio.T, dtype=np.float32), self.engine.last_status)
            while not self.stop.is_set():
                try:
                    self.q.put(item, timeout=0.2)
                    break
                except queue.Full:
                    continue

    def _callback(self, outdata, frames, _time, _status):
        filled = 0
        while filled < frames:
            if self.idx >= len(self.cur):
                try:
                    self.cur, self.now_playing = self.q.get_nowait()
                    self.idx = 0
                except queue.Empty:
                    outdata[filled:] = 0
                    self.underruns += 1
                    return
            n = min(frames - filled, len(self.cur) - self.idx)
            outdata[filled:filled + n] = self.cur[self.idx:self.idx + n]
            filled += n
            self.idx += n

    def run(self):
        producer = threading.Thread(target=self._produce, daemon=True)
        producer.start()
        while not self.q.full():  # pre-buffer
            time.sleep(0.05)
        print("fhmusic is playing. Press Ctrl+C to stop.\n\n")
        try:
            with sd.OutputStream(samplerate=SR, channels=2, dtype="float32", device=self.device,
                                 blocksize=1024, latency="high", callback=self._callback):
                while True:
                    if self.now_playing:
                        line = format_status(self.now_playing)
                        if self.underruns:
                            line += f" │ ⚠ underruns {self.underruns}"
                        # two status lines, redrawn in place
                        sys.stdout.write("\x1b[1A\r\x1b[2K" + line + "\n\r\x1b[2K" + format_layers(self.now_playing))
                        sys.stdout.flush()
                    time.sleep(0.2)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop.set()
            print("\nStopped.")
