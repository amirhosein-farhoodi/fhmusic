"""Rhythm lanes, basslines, motifs and harmony.

Lanes are indexed by a *global* 16th-step counter, not reset each bar, so
lanes with different lengths (polymeter) drift against each other and the
combined groove takes a long time to repeat.
"""

from dataclasses import dataclass

import numpy as np

STEPS = 16
POLY_LENGTHS = [12, 24, 6, 8, 32]  # beat-aligned: odd lengths (7, 9, 11...) sounded out of sync
PROGRESSIONS = [[0], [0, 1], [0, 5], [0, -2], [0, 5, 6, 4], [0, 3, 0, 1],
                [0, -1, -2, -1], [0, 6, 5, 6], [0, 4], [0, 0, 1, 0]]


def euclid(hits: int, steps: int, rotate: int = 0) -> list[bool]:
    """Euclidean rhythm: spread `hits` as evenly as possible over `steps`."""
    on = [((i * hits) % steps) < hits for i in range(steps)]
    r = rotate % steps
    return on[-r:] + on[:-r] if r else on


def deg_semi(deg: int, scale: list[int]) -> int:
    """Scale degree (any integer, 7 = octave up) -> semitones."""
    return scale[deg % len(scale)] + 12 * (deg // len(scale))


def chord_degrees(root: int, kind: str) -> list[int]:
    return {"triad": [root, root + 2, root + 4],
            "seventh": [root, root + 2, root + 4, root + 6],
            "sus": [root, root + 3, root + 4],
            "power": [root, root + 4, root + 7]}[kind]


# --------------------------------------------------------------------------- lanes

@dataclass
class Lane:
    vel: list[float]
    prob: list[float]

    def at(self, gstep: int) -> tuple[float, float]:
        i = gstep % len(self.vel)
        return self.vel[i], self.prob[i]


def lane_length(rng, groove: float) -> int:
    return int(rng.choice(POLY_LENGTHS)) if rng.random() < groove else STEPS


def euclid_lane(rng, length: int, density: float, ghost: float = 0.0) -> Lane:
    mask = euclid(max(1, round(length * density)), length, int(rng.integers(length)))
    vel = [float(rng.uniform(0.7, 1.0)) if on else (0.35 if rng.random() < ghost else 0.0) for on in mask]
    prob = [float(rng.uniform(0.75, 1.0)) if on else 0.5 for on in mask]
    return Lane(vel, prob)


def kick_lane(rng) -> Lane:
    vel = [1.0 if i % 4 == 0 else 0.0 for i in range(STEPS)]
    if rng.random() < 0.35:
        vel[int(rng.choice([3, 7, 11, 14, 15]))] = 0.5
    return Lane(vel, [1.0] * STEPS)


def hat_lane(rng, groove: float) -> Lane:
    mode = rng.choice(["16", "8", "offbeat", "gallop", "broken"])
    if mode == "broken":
        return euclid_lane(rng, lane_length(rng, groove), rng.uniform(0.45, 0.7), ghost=0.3)
    vel, prob = [], []
    for i in range(STEPS):
        q = i % 4
        if mode == "16":
            v, p = (1.0, 1.0) if q == 2 else ((0.75, 0.9) if q == 0 else (0.5, 0.6))
        elif mode == "8":
            v, p = (1.0, 1.0) if q == 2 else ((0.8, 0.9) if q == 0 else (0.0, 0.0))
        elif mode == "offbeat":
            v, p = (1.0, 1.0) if q == 2 else ((0.4, 0.3) if rng.random() < 0.3 else (0.0, 0.0))
        else:  # gallop
            v, p = (1.0, 1.0) if q == 2 else ((0.7, 0.8) if q == 3 else (0.0, 0.0))
        vel.append(v)
        prob.append(p)
    return Lane(vel, prob)


def open_hat_lane(rng) -> Lane:
    vel = [1.0 if i % 4 == 2 else 0.0 for i in range(STEPS)]
    if rng.random() < 0.3:
        vel[15] = 0.6
    return Lane(vel, [1.0 if v else 0.0 for v in vel])


def snare_lane(rng) -> Lane:
    options = [(16, {4: 1, 12: 1}), (16, {12: 1}), (16, {4: 1, 12: 1, 14: 0.5}),
               (32, {4: 1, 12: 1, 20: 1, 28: 1, 30: 0.5}), (32, {12: 1, 28: 1, 31: 0.6})]
    length, hits = options[rng.integers(len(options))]
    vel = [float(hits.get(i, 0.0)) for i in range(length)]
    return Lane(vel, [1.0] * length)


def mutate_lane(rng, lane: Lane, groove: float) -> Lane:
    if rng.random() < 0.5:  # rotate
        k = int(rng.choice([-1, 1]))
        return Lane(lane.vel[k:] + lane.vel[:k], lane.prob[k:] + lane.prob[:k])
    hits = sum(1 for v in lane.vel if v >= 0.7)
    return euclid_lane(rng, lane_length(rng, groove), np.clip(hits / len(lane.vel) + rng.uniform(-0.1, 0.1), 0.1, 0.6),
                       ghost=groove * 0.3)


# --------------------------------------------------------------------------- bass

@dataclass
class BassLine:
    vel: list[float]
    deg: list[int]
    gate: list[float]
    spice: float

    def at(self, gstep: int) -> tuple[float, int, float]:
        i = gstep % len(self.vel)
        return self.vel[i], self.deg[i], self.gate[i]


BASS_SPICE = [7, 1, 2, 4, -1, -3, 3]


def make_bass(rng, mode: str, groove: float) -> BassLine:
    vel, deg, gate = [], [], []
    for i in range(STEPS):
        q = i % 4
        v, g = 0.0, 0.8
        if mode == "rolling" and q:
            v = (0.8, 1.0, 0.9)[q - 1]
        elif mode == "offbeat" and q == 2:
            v = 1.0
        elif mode == "gallop" and q in (2, 3):
            v = 1.0 if q == 2 else 0.8
        elif mode == "triplet" and q in (1, 2):
            v = 0.9
        elif mode == "ebm":
            v, g = (0.7 if q == 0 else 1.0), 0.45
        elif mode == "sub" and q == 2:
            v, g = 1.0, 1.6
        vel.append(v)
        deg.append(0)
        gate.append(g)
    if mode == "ebm":  # classic octave jumps
        jumps = [[1, 3], [3], [2], [1, 2, 3]][rng.integers(4)]
        deg = [7 if (i % 4) in jumps else 0 for i in range(STEPS)]
    length = 32 if rng.random() < 0.5 else 16
    if mode == "ebm" and rng.random() < groove * 0.6:
        length = int(rng.choice([12, 24]))
    reps = -(-length // STEPS)
    line = BassLine((vel * reps)[:length], (deg * reps)[:length], (gate * reps)[:length],
                    float(rng.uniform(0.05, 0.3)))
    return respice_bass(rng, line)


def respice_bass(rng, b: BassLine) -> BassLine:
    """Re-roll the 'spice' notes (non-root degrees) of a bassline."""
    deg = [d if d == 7 else 0 for d in b.deg]
    for i, v in enumerate(b.vel):
        if v > 0 and rng.random() < b.spice:
            deg[i] = int(rng.choice(BASS_SPICE))
    return BassLine(b.vel, deg, b.gate, b.spice)


# --------------------------------------------------------------------------- motifs

@dataclass
class Motif:
    length: int
    notes: dict[int, tuple[int, int, float]]  # step -> (degree, length in steps, velocity)


def make_motif(rng, length: int, density: float, span: int = 4) -> Motif:
    mask = euclid(max(2, round(length * density)), length, int(rng.integers(length)))
    notes, deg = {}, 0
    for i, on in enumerate(mask):
        if on:
            notes[i] = (deg, int(rng.choice([1, 1, 2, 3])), float(rng.uniform(0.7, 1.0)))
            deg = int(np.clip(deg + rng.choice([-3, -2, -1, -1, 0, 1, 1, 2, 3]), -span, span))
    return Motif(length, notes)


def vary_motif(rng, m: Motif) -> Motif:
    """Develop a motif: transpose part, invert, shift rhythm, or thin/add."""
    notes = dict(m.notes)
    kind = rng.integers(4)
    if kind == 0:
        shift = int(rng.choice([-2, -1, 1, 2]))
        notes = {s: ((d + shift) if rng.random() < 0.4 else d, ln, v) for s, (d, ln, v) in notes.items()}
    elif kind == 1:
        notes = {s: (-d, ln, v) for s, (d, ln, v) in notes.items()}
    elif kind == 2:
        k = int(rng.integers(1, 4))
        notes = {(s + k) % m.length: n for s, n in notes.items()}
    else:
        if len(notes) > 2 and rng.random() < 0.5:
            del notes[int(rng.choice(list(notes)))]
        else:
            free = [s for s in range(m.length) if s not in notes]
            if free:
                notes[int(rng.choice(free))] = (int(rng.integers(-2, 3)), 1, 0.8)
    return Motif(m.length, notes)


@dataclass
class Arp:
    cycle: list[int]  # indices into chord tones (wrapping up octaves)
    rate: int         # in 16ths
    gate: float


def make_arp(rng) -> Arp:
    n = int(rng.choice([3, 4, 5, 6, 7]))
    shape = rng.choice(["up", "updown", "random"])
    if shape == "up":
        cycle = list(range(n))
    elif shape == "updown":
        cycle = list(range(n)) + list(range(n - 2, 0, -1))
    else:
        cycle = [int(x) for x in rng.integers(0, 5, n)]
    return Arp(cycle, int(rng.choice([1, 2, 2, 3])), float(rng.uniform(0.4, 0.9)))
