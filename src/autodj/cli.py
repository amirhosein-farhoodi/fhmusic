"""Command line entry point.

    uv run autodj                         # play live, forever
    uv run autodj --style ebm             # lock to one style profile
    uv run autodj --seed 7 --bpm 140      # reproducible set at a chosen tempo
    uv run autodj --render 600 --out set.wav   # write 10 minutes to a file
"""

import argparse
import time

import numpy as np
from scipy.io import wavfile

from .engine import Engine
from .style import STYLES
from .synth import SR


def main() -> None:
    ap = argparse.ArgumentParser(description="Self-playing generative industrial techno.")
    ap.add_argument("--style", choices=list(STYLES),
                    help="lock to one style: " + ", ".join(f"{k} ({s.name})" for k, s in STYLES.items()))
    ap.add_argument("--seed", type=int, help="random seed (same seed = same set)")
    ap.add_argument("--bpm", type=float, help="starting tempo")
    ap.add_argument("--device", help="audio output device name or index")
    ap.add_argument("--render", type=float, metavar="SECONDS", help="render to a WAV file instead of playing")
    ap.add_argument("--out", default="autodj_set.wav", help="output file for --render")
    args = ap.parse_args()

    engine = Engine(seed=args.seed, bpm=args.bpm, style=args.style)

    if args.render:
        from .player import format_status
        chunks, total, t0, last = [], 0, time.time(), None
        while total < args.render * SR:
            bar = engine.render_bar()
            chunks.append(bar)
            s = engine.last_status
            if last is None or (s["track_no"], s["section"]) != last:
                print(f"{total / SR:7.1f}s  {format_status(s)}")
                last = (s["track_no"], s["section"])
            total += bar.shape[1]
        audio = np.concatenate(chunks, axis=1).T
        wavfile.write(args.out, SR, (audio * 32767).astype(np.int16))
        took = time.time() - t0
        print(f"\nWrote {args.out}: {total / SR:.0f}s of audio in {took:.1f}s "
              f"({total / SR / took:.0f}x real-time)")
        return

    from .player import Player
    device = int(args.device) if args.device and args.device.isdigit() else args.device
    Player(engine, device=device).run()
