"""Sound generators.

Every sound is synthesized from oscillators and noise -- no samples.

Most drum generators take `morph` (0..1). A `Bank` renders several morph
variants of one sound design so the engine can sweep timbre continuously
(decay, brightness) like a modulated modular voice.
"""

import numpy as np
from scipy import signal

SR = 48000
NYQ = SR / 2
TAU = 2 * np.pi


# --------------------------------------------------------------------------- helpers

def n_samples(seconds: float) -> int:
    return max(1, int(seconds * SR))


def timeline(n: int) -> np.ndarray:
    return np.arange(n) / SR


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x, kind: str, cutoff, order: int = 2):
    """Butterworth filter. kind: 'low' | 'high' | 'band' (cutoff=(lo, hi))."""
    if kind == "band":
        lo, hi = cutoff
        lo = max(lo, 20)
        hi = max(min(hi, NYQ * 0.95), lo * 1.05)
        wn = [lo / NYQ, hi / NYQ]
    else:
        wn = min(max(cutoff, 20), NYQ * 0.95) / NYQ
    btype = {"low": "lowpass", "high": "highpass", "band": "bandpass"}[kind]
    sos = signal.butter(order, wn, btype=btype, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def resonate(x, freq: float, q: float, amount: float):
    """Add a resonant peak (emulates filter resonance)."""
    b, a = signal.iirpeak(min(freq, NYQ * 0.9) / NYQ, q)
    return x + amount * signal.lfilter(b, a, x)


def drive(x, amount: float):
    """Soft-clip distortion."""
    return np.tanh(x * amount) / np.tanh(amount)


def fade_out(x, ms: float = 5.0):
    n = min(x.shape[-1], int(SR * ms / 1000))
    x[..., -n:] *= np.linspace(1, 0, n)
    return x


def normalize(x, peak: float = 1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def saw(freq, t):
    return 2 * ((freq * t) % 1.0) - 1


def sweep_phase(freq_curve):
    return TAU * np.cumsum(freq_curve) / SR


class Bank:
    """Pre-rendered timbre variants of one sound design (same seed, different morph)."""

    def __init__(self, fn, seed: int, n: int = 6):
        self.variants = [fn(np.random.default_rng(seed), i / (n - 1)) for i in range(n)]

    def pick(self, morph: float) -> np.ndarray:
        return self.variants[int(round(np.clip(morph, 0, 1) * (len(self.variants) - 1)))]


# --------------------------------------------------------------------------- drums

# Kick quality window, measured on the rendered kick (see kick_quality):
KICK_TAIL_DB = -20.0          # level 400 ms after the hit (the next beat at 150 BPM) must be below this
KICK_BRIGHT_DB = (-17.0, -8.0)  # energy above 200 Hz vs below 100 Hz: not dull, not fizzy
# Envelope after the distortion, per character: (hold seconds, release time constant)
KICK_AMP = {"punch": (0.08, 0.09), "hard": (0.1, 0.1), "boom": (0.13, 0.12)}


def kick_quality(x: np.ndarray) -> tuple[float, float]:
    """(tail dB at 400 ms, brightness dB) -- what makes a kick sound tight or muddy, clean or fizzy."""
    w = n_samples(0.01)
    ref = np.sqrt(np.mean(x[:n_samples(0.03)] ** 2)) + 1e-9
    i = n_samples(0.4)
    tail = 20 * np.log10(np.sqrt(np.mean(x[i:i + w] ** 2)) / ref + 1e-9) if len(x) > i + w else -99.0
    f, p = signal.welch(x, SR, nperseg=4096)
    bright = 10 * np.log10(p[f >= 200].sum() / (p[f < 100].sum() + 1e-12) + 1e-12)
    return float(tail), float(bright)


def _kick_once(rng, aggression: float) -> np.ndarray:
    kind = str(rng.choice(["punch", "boom", "hard"]))
    f_end, f_start = rng.uniform(44, 56), rng.uniform(160, 320)
    pitch_decay = rng.uniform(0.02, 0.045)
    decay = {"punch": rng.uniform(0.12, 0.2), "boom": rng.uniform(0.2, 0.32),
             "hard": rng.uniform(0.15, 0.25)}[kind]
    click_amt = rng.uniform(0.1, 0.4)
    amt = 1.5 + aggression * 6 * rng.uniform(0.7, 1.2)
    tone = 2500 + (1 - aggression) * 6000 * rng.uniform(0.5, 1)
    hold, rel = KICK_AMP[kind]
    hold *= rng.uniform(0.85, 1.15)

    n = n_samples(0.6)
    t = timeline(n)
    freq = f_end + (f_start - f_end) * np.exp(-t / pitch_decay)
    body = np.sin(sweep_phase(freq)) * np.exp(-t / decay)
    click = filt(rng.standard_normal(n), "high", 2000) * np.exp(-t / 0.003) * click_amt
    x = drive(body + click, amt)
    if kind == "hard":
        x = np.clip(x * 1.4, -1, 1)
    x = filt(x, "low", tone)
    # parallel distortion: some clean body underneath keeps the sub weight a hard drive eats
    x = 0.8 * x + 0.35 * body
    # the distortion flattens the body's decay, so shape the level *after* it (like gating a distorted kick)
    x *= np.where(t < hold, 1.0, np.exp(-(t - hold) / rel))
    return normalize(fade_out(x))


def kick(rng, aggression: float) -> np.ndarray:
    """Industrial kick: pitch-swept sine + click, driven according to `aggression`.

    Each design is auditioned: a kick that rings into the next beat (mud) or is all
    distortion fizz is thrown away and re-rolled, like a producer skipping a bad sample."""
    best, best_err = None, np.inf
    for _ in range(12):
        x = _kick_once(rng, aggression)
        tail, bright = kick_quality(x)
        lo, hi = KICK_BRIGHT_DB
        err = max(0.0, tail - KICK_TAIL_DB) + max(0.0, lo - bright) + max(0.0, bright - hi)
        if err == 0:
            return x
        if err < best_err:
            best, best_err = x, err
    return best


def hat(rng, open_: bool, morph: float) -> np.ndarray:
    base, hp, noise_amt = rng.uniform(300, 520), rng.uniform(6000, 9000), rng.uniform(0.4, 0.9)
    decay = (0.06 + 0.3 * morph) if open_ else (0.01 + 0.045 * morph)
    n = n_samples(decay * 5 + 0.01)
    t = timeline(n)
    metal = sum(signal.square(TAU * base * r * t) for r in (2, 3, 4.16, 5.43, 6.79, 8.21)) / 6
    x = (1 - noise_amt) * metal + noise_amt * rng.standard_normal(n)
    x = filt(x, "high", hp * (1.15 - 0.35 * morph)) * np.exp(-t / decay)
    return normalize(fade_out(x))


def snare(rng, morph: float) -> np.ndarray:
    f, lo, hi, amt = rng.uniform(160, 230), rng.uniform(700, 1500), rng.uniform(5000, 9000), rng.uniform(2, 5)
    decay = 0.06 + 0.2 * morph
    n = n_samples(decay * 5)
    t = timeline(n)
    tone = np.sin(TAU * f * t) * np.exp(-t / 0.04)
    noise = filt(rng.standard_normal(n), "band", (lo, hi)) * np.exp(-t / decay)
    return normalize(fade_out(drive(0.6 * tone + noise, amt)))


def clap(rng, morph: float) -> np.ndarray:
    spread, lo, amt = rng.uniform(0.007, 0.012), rng.uniform(800, 1400), rng.uniform(1.5, 4)
    tail = 0.05 + 0.25 * morph
    n = n_samples(tail * 5 + 0.05)
    t = timeline(n)
    env = np.zeros(n)
    for k in range(4):
        start = k * spread
        tk = np.clip(t - start, 0, None)
        env += (t >= start) * np.exp(-tk / (0.006 if k < 3 else tail))
    x = filt(rng.standard_normal(n), "band", (lo, lo * 4)) * env
    return normalize(fade_out(drive(x, amt)))


# NOTE: no inharmonic sine/FM percussion here. Ringing inharmonic partials are
# how synths make bells -- they sounded like a cafe counter bell ("ding").
# Metal hits are built from wide-band noise instead, so they have no pitch.

def _hammer(rng, m):
    """Hammer on a steel plate: noise through wide bands + a short thump. No pitch."""
    centers = rng.uniform(300, 4000, 3)
    thump_f, amt = rng.uniform(80, 150), rng.uniform(4, 8)
    decay = 0.015 + 0.05 * m
    n = n_samples(decay * 6 + 0.01)
    t = timeline(n)
    thump = np.sin(sweep_phase(thump_f * (1 + np.exp(-t / 0.005)))) * np.exp(-t / 0.02)
    noise = rng.standard_normal(n)
    x = sum(filt(noise, "band", (c * 0.6, c * 1.6)) for c in centers) * np.exp(-t / decay)
    return drive(x + 0.6 * thump, amt)


def _ping(rng, m):
    """Self-oscillating-filter ping: a short, low, pitched click."""
    f, amt = rng.uniform(150, 900), rng.uniform(2, 5)
    decay = 0.01 + 0.05 * m
    n = n_samples(decay * 5)
    t = timeline(n)
    freq = f * (1 + 0.5 * np.exp(-t / 0.004))
    x = np.sin(sweep_phase(freq)) * np.exp(-t / decay)
    x[:96] += filt(rng.standard_normal(96), "low", 5000) * np.linspace(0.6, 0, 96)
    return drive(x, amt)


def _zap(rng, m):
    f0, f1, pd, amt = rng.uniform(2000, 6000), rng.uniform(60, 200), rng.uniform(0.005, 0.02), rng.uniform(1.5, 5)
    decay = 0.03 + 0.12 * m
    n = n_samples(decay * 5)
    t = timeline(n)
    freq = f1 + (f0 - f1) * np.exp(-t / pd)
    return drive(np.sin(sweep_phase(freq)) * np.exp(-t / decay), amt)


def _tom(rng, m):
    f, amt = rng.uniform(70, 180), rng.uniform(2, 5)
    decay = 0.08 + 0.3 * m
    n = n_samples(decay * 5)
    t = timeline(n)
    freq = f * (1 + 0.6 * np.exp(-t / 0.03))
    return drive(np.sin(sweep_phase(freq)) * np.exp(-t / decay), amt)


def _scrape(rng, m):
    """Metal scrape: grainy, fluttering noise burst. No pitch."""
    grain, lo, amt = int(rng.integers(80, 300)), rng.uniform(800, 2500), rng.uniform(2, 5)
    decay = 0.04 + 0.12 * m
    n = n_samples(decay * 5)
    t = timeline(n)
    flutter = np.repeat(rng.uniform(0.2, 1.0, n // grain + 1), grain)[:n]
    x = filt(rng.standard_normal(n), "band", (lo, lo * 4)) * flutter
    x *= np.minimum(1, t / 0.005) * np.exp(-t / decay)
    return drive(x, amt)


def _rim(rng, m):
    f = rng.uniform(1500, 3500)
    decay = 0.005 + 0.02 * m
    n = n_samples(decay * 6 + 0.005)
    t = timeline(n)
    tone = np.sin(TAU * f * t) * np.exp(-t / 0.004) * 0.3  # tiny: a long pure high tone = 'ding'
    x = tone + filt(rng.standard_normal(n), "band", (f * 0.5, f * 2.0)) * np.exp(-t / decay)
    return drive(x, 3)


PERC = {"hammer": _hammer, "ping": _ping, "zap": _zap, "tom": _tom, "scrape": _scrape, "rim": _rim}
PERC_KINDS = list(PERC)


def perc(rng, morph: float, kind: str) -> np.ndarray:
    return normalize(fade_out(PERC[kind](rng, morph)))


def noise_hit(rng, morph: float) -> np.ndarray:
    """Bit-crushed noise burst (power-electronics style percussion)."""
    hold, levels = int(rng.integers(2, 12)), int(rng.choice([3, 6, 12]))
    lo = rng.uniform(300, 3000)
    amt = rng.uniform(3, 8)
    decay = 0.02 + 0.2 * morph
    n = n_samples(decay * 5)
    t = timeline(n)
    x = rng.standard_normal(n)
    x = np.repeat(x[::hold], hold)[:n]
    x = np.round(np.clip(x / 3, -1, 1) * levels) / levels
    x = filt(x, "band", (lo, lo * 6)) * np.exp(-t / decay)
    return normalize(fade_out(drive(x, amt)))


# --------------------------------------------------------------------------- tonal

def _osc(wave: str, freq: float, t, detune: float = 0.006):
    if wave == "square":
        return 0.6 * signal.square(TAU * freq * t) + 0.4 * signal.square(TAU * freq * (1 + detune) * t)
    if wave == "sub":
        return np.sin(TAU * freq * t) + 0.25 * np.sin(TAU * freq * 2 * t)
    return 0.5 * (saw(freq, t) + saw(freq * (1 + detune), t))


def bass_note(freq: float, length_s: float, cutoff: float, drive_amt: float, wave: str = "saw") -> np.ndarray:
    n = n_samples(length_s + 0.01)
    t = timeline(n)
    x = _osc(wave, freq, t)
    pluck = np.exp(-t / 0.04)
    x = filt(x, "low", cutoff) * (1 - pluck) + filt(x, "low", cutoff * 4) * pluck
    amp = np.minimum(1, t / 0.002) * np.exp(-t / (length_s * 0.6))
    return fade_out(drive(x * amp, drive_amt), 3)


def lead_note(freq: float, length_s: float, cutoff: float, reso: float, drive_amt: float,
              wave: str = "saw") -> np.ndarray:
    """Resonant filtered synth note with a pluck envelope (leads and arps)."""
    n = n_samples(length_s + 0.06)
    t = timeline(n)
    x = _osc(wave, freq, t, 0.004)
    pl = np.exp(-t / 0.06)
    x = filt(x, "low", cutoff) * (1 - pl) + filt(x, "low", min(cutoff * 5, 16000)) * pl
    x = resonate(x, cutoff, 3 + reso * 10, reso * 3)
    amp = np.minimum(1, t / 0.003) * np.exp(-t / (length_s * 0.7))
    return normalize(fade_out(drive(normalize(x) * amp, drive_amt), 30))


def stab(freqs, rng, morph: float) -> np.ndarray:
    """Dark detuned chord stab."""
    n = n_samples(0.9)
    t = timeline(n)
    x = sum(saw(f * (1 + d), t) for f in freqs for d in (-0.008, 0, 0.008))
    x = filt(x, "low", 600 + 1800 * morph)
    x *= np.minimum(1, t / 0.003) * np.exp(-t / (0.1 + 0.3 * morph))
    return normalize(fade_out(drive(normalize(x), 2.0)))


def pad(freqs, dur_s: float, brightness: float, rng) -> np.ndarray:
    """Wide detuned saw pad, slow swell. Returns stereo (2, n)."""
    n = n_samples(dur_s)
    t = timeline(n)
    out = np.zeros((2, n))
    for f in freqs:
        for k, d in enumerate(rng.uniform(-0.009, 0.009, 4)):
            out[k % 2] += saw(f * (1 + d), t + rng.uniform() / f)
    out = filt(out, "low", 300 + 2500 * brightness)
    att = min(dur_s * 0.3, 1.5)
    env = np.minimum(1, t / att) * np.clip((dur_s - t) / min(dur_s * 0.25, 1.0), 0, 1)
    return normalize(out * env)


FORMANTS = {"a": (730, 1090, 2440), "e": (530, 1840, 2480), "i": (270, 2290, 3010),
            "o": (570, 840, 2410), "u": (300, 870, 2240)}


def voice(freq: float, length_s: float, vowel: str, rng) -> np.ndarray:
    """Synthetic vocal chant: buzzing glottal source through vowel formants."""
    n = n_samples(length_s)
    t = timeline(n)
    f = freq * (1 + 0.006 * np.sin(TAU * 5.5 * t)) * (1 + 0.003 * rng.standard_normal())
    src = 2 * ((np.cumsum(f) / SR) % 1.0) - 1 + 0.15 * rng.standard_normal(n)
    x = sum(g * filt(src, "band", (F * 0.88, F * 1.12)) for F, g in zip(FORMANTS[vowel], (1.0, 0.5, 0.25)))
    amp = np.minimum(1, t / 0.03) * np.clip((length_s - t) / 0.08, 0, 1)
    return normalize(drive(normalize(x) * amp * 1.5, 2))


# --------------------------------------------------------------------------- background layers

def drone(t_abs: np.ndarray, root: float, rng) -> np.ndarray:
    """Stereo atmosphere. Tonal part uses absolute time so bar-by-bar
    segments line up seamlessly when cross-faded."""
    ph = TAU * t_abs
    wobble = 1 + 0.3 * np.sin(TAU * 0.07 * t_abs)
    tone = (0.40 * np.sin(ph * root * 4) + 0.30 * np.sin(ph * root * 4 * 1.004)
            + 0.20 * np.sin(ph * root * 6) + 0.12 * np.sin(ph * root * 8 * 0.997)) * wobble
    hiss = filt(rng.standard_normal((2, len(t_abs))), "band", (400, 2500)) * 0.35
    return tone[None, :] * 0.8 + hiss


def texture(kind: str, t_abs: np.ndarray, root: float, rng) -> np.ndarray:
    """Industrial background: machine hum, radio static, siren. Stereo."""
    n = len(t_abs)
    if kind == "machine":
        hum = sum(np.sin(TAU * root * 2 * k * t_abs) / k for k in range(1, 7))
        hum *= 0.6 + 0.4 * np.sin(TAU * 0.37 * t_abs)
        gate = 0.5 + 0.5 * np.sign(np.sin(TAU * 1.7 * t_abs))
        clatter = filt(rng.standard_normal((2, n)), "band", (2000, 6000)) * gate * 0.4
        return hum[None, :] * 0.5 + clatter
    if kind == "radio":
        am = np.abs(filt(rng.standard_normal(n), "low", 8)) * 6
        static = filt(rng.standard_normal((2, n)), "band", (900, 3200)) * np.clip(am, 0, 1.5)
        beep = np.sin(TAU * 1800 * t_abs) * (np.sin(TAU * 0.5 * t_abs) > 0.97) * 0.3
        return static + beep[None, :]
    if kind == "siren":
        f0, rate, dev = root * 8, 0.11, 0.25
        ph = TAU * (f0 * t_abs - f0 * dev * np.cos(TAU * rate * t_abs) / (TAU * rate))
        x = np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
        pan = 0.5 + 0.4 * np.sin(TAU * 0.05 * t_abs)
        return np.stack([x * (1 - pan), x * pan]) * 0.8
    return drone(t_abs, root, rng)


# --------------------------------------------------------------------------- fx sounds

def impact(rng) -> np.ndarray:
    n = n_samples(2.5)
    t = timeline(n)
    freq = 35 + 120 * np.exp(-t / 0.08)
    boom = np.sin(sweep_phase(freq)) * np.exp(-t / 0.7)
    noise = filt(rng.standard_normal(n), "low", 3000) * np.exp(-t / 0.4) * 0.5
    return normalize(fade_out(drive(boom + noise, 3), 50))


def riser(rng, seconds: float) -> np.ndarray:
    """Noise sweep rising into a drop (time-varying band-pass)."""
    n = n_samples(seconds)
    t = timeline(n)
    prog = t / seconds
    noise = rng.standard_normal(n)
    out = np.empty(n)
    edges = np.linspace(0, n, 65).astype(int)
    zi = None
    for a, b in zip(edges[:-1], edges[1:]):
        fc = 300 * (12000 / 300) ** prog[a]
        sos = signal.butter(2, [fc * 0.7 / NYQ, min(fc * 1.5, NYQ * 0.95) / NYQ],
                            btype="bandpass", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[a:b], zi = signal.sosfilt(sos, noise[a:b], zi=zi)
    out = normalize(out) * prog ** 2
    tone = np.sin(sweep_phase(100 * 8 ** prog)) * prog ** 3 * 0.3
    return normalize(fade_out(out + tone, 10))


# --------------------------------------------------------------------------- spaces

def reverb_ir(rng, seconds: float) -> np.ndarray:
    n = n_samples(seconds)
    t = timeline(n)
    ir = rng.standard_normal((2, n)) * np.exp(-t * 6.9 / seconds)
    ir = filt(ir, "low", rng.uniform(3500, 7000))
    ramp = n_samples(0.01)
    ir[:, :ramp] *= np.linspace(0, 1, ramp)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def rumble_ir(rng) -> np.ndarray:
    n = n_samples(0.9)
    t = timeline(n)
    ir = filt(rng.standard_normal(n) * np.exp(-t / rng.uniform(0.15, 0.3)), "low", 400)
    return ir / np.sqrt(np.sum(ir ** 2))
