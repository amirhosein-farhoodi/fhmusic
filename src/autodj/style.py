"""The 'scale' system: style profiles as points on 0..1 scales.

See docs/STYLE_GUIDE.md for the research behind these numbers.
"""

from dataclasses import dataclass, replace

import numpy as np

SCALES = {
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
    "phrygian dominant": [0, 1, 4, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "hungarian minor": [0, 2, 3, 6, 7, 8, 11],
}
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

SCALE_FIELDS = ("distortion", "noise", "rumble", "groove", "melody",
                "harmony", "voice", "space", "breaks")


@dataclass(frozen=True)
class Style:
    key: str
    name: str
    bpm: tuple[float, float]
    intensity: float      # where this style sits in a set's energy arc
    distortion: float
    noise: float
    rumble: float
    groove: float         # polymeter / complexity
    swing: float          # 0 .. 0.15 of a 16th
    melody: float
    harmony: float
    voice: float
    space: float
    breaks: float
    scales: tuple[str, ...]
    bass_modes: tuple[str, ...]

    def jitter(self, rng, amount: float = 0.12) -> "Style":
        """Every track is a unique point near its profile."""
        ch = {f: float(np.clip(getattr(self, f) + rng.uniform(-amount, amount), 0, 1))
              for f in SCALE_FIELDS}
        ch["swing"] = float(np.clip(self.swing + rng.uniform(-0.03, 0.03), 0, 0.15))
        return replace(self, **ch)


STYLES = {s.key: s for s in [
    Style("hypnotic", "Hypnotic Warehouse", (130, 138), 0.5,
          distortion=0.35, noise=0.2, rumble=0.85, groove=0.8, swing=0.06,
          melody=0.2, harmony=0.3, voice=0.15, space=0.75, breaks=0.2,
          scales=("phrygian", "aeolian"), bass_modes=("rolling", "offbeat", "sub")),
    Style("noise", "Noise Assault", (138, 150), 0.95,
          distortion=0.9, noise=0.9, rumble=0.9, groove=0.5, swing=0.02,
          melody=0.15, harmony=0.25, voice=0.25, space=0.5, breaks=0.5,
          scales=("locrian", "phrygian"), bass_modes=("rolling", "gallop")),
    Style("ebm", "EBM Body", (126, 136), 0.6,
          distortion=0.5, noise=0.3, rumble=0.4, groove=0.4, swing=0.1,
          melody=0.5, harmony=0.35, voice=0.6, space=0.4, breaks=0.4,
          scales=("phrygian", "aeolian", "phrygian dominant"), bass_modes=("ebm", "gallop")),
    Style("rave", "Rave Industrial", (138, 148), 0.85,
          distortion=0.65, noise=0.4, rumble=0.7, groove=0.5, swing=0.04,
          melody=0.8, harmony=0.85, voice=0.4, space=0.8, breaks=0.7,
          scales=("aeolian", "phrygian", "hungarian minor", "dorian"), bass_modes=("rolling", "offbeat")),
    Style("mutant", "Modular Mutant", (128, 140), 0.7,
          distortion=0.7, noise=0.6, rumble=0.5, groove=0.95, swing=0.08,
          melody=0.35, harmony=0.15, voice=0.3, space=0.45, breaks=0.35,
          scales=("locrian", "phrygian"), bass_modes=("triplet", "rolling", "ebm")),
]}


def pick_style(rng, intensity: float, prev_key: str | None = None, locked: str | None = None) -> Style:
    if locked:
        return STYLES[locked].jitter(rng)
    keys = list(STYLES)
    w = np.array([np.exp(-((STYLES[k].intensity - intensity) ** 2) / 0.06) *
                  (0.3 if k == prev_key else 1.0) for k in keys])
    return STYLES[keys[rng.choice(len(keys), p=w / w.sum())]].jitter(rng)


def pick_bpm(rng, style: Style, intensity: float, prev_bpm: float | None = None) -> float:
    lo, hi = style.bpm
    bpm = lo + (hi - lo) * intensity + rng.uniform(-2, 2)
    if prev_bpm:
        bpm = np.clip(bpm, prev_bpm - 6, prev_bpm + 6)
    return float(np.clip(bpm, 124, 152))
