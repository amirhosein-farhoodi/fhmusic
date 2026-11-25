"""Master bus: what a mastering chain does to a club track, bar by bar.

    input -> low end to mono -> soft clipper -> look-ahead limiter -> out

  * mono bass: below ~120 Hz the side signal is removed, so the low end hits
    the same in both speakers (and survives a mono club system).
  * soft clipper: shaves the kick's sharpest peaks with a smooth knee. A little
    of this is the classic loud-techno sound; it only touches the top few dB.
  * limiter: catches what's left with a short look-ahead and a smooth release,
    so peaks never clip and the rest of the mix isn't squashed along with them.

Everything is stateful across bars, so filters and the limiter's gain flow
continuously. The look-ahead delays the output by LOOKAHEAD_MS.
"""

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

from .synth import SR

LOOKAHEAD_MS = 3.0
RELEASE_MS = 140.0
CEILING = 10 ** (-1.5 / 20)   # -1.5 dBFS sample peak (about -1 dBTP): headroom for MP3/AAC conversions and the browser's own EQ
CLIP_KNEE = 0.72               # clipper is transparent below this level...
CLIP_MAX = 1.08                # ...and never outputs more than this (the limiter takes it from there)
MONO_BELOW_HZ = 120.0


def soft_clip(x: np.ndarray, knee: float = CLIP_KNEE, top: float = CLIP_MAX) -> np.ndarray:
    """Linear below `knee`, then a tanh curve that approaches `top`."""
    a = np.abs(x)
    over = a > knee
    if not over.any():
        return x
    y = x.copy()
    room = top - knee
    y[over] = np.sign(x[over]) * (knee + room * np.tanh((a[over] - knee) / room))
    return y


class Master:
    def __init__(self, gain: float = 1.0):
        self.gain = gain
        self.la = int(LOOKAHEAD_MS / 1000 * SR) // 2 * 2  # even, so the min-filter window centres exactly
        self.delay = np.zeros((2, self.la))
        self.m_hist = np.ones(self.la)          # last look-ahead gains (for the attack smoothing)
        self.h_prev = 0.0                        # 1 - previous output gain (release state)
        self.log_rel = -1.0 / (RELEASE_MS / 1000 * SR)
        self.side_hp = signal.butter(2, MONO_BELOW_HZ / (SR / 2), btype="high", output="sos")
        self.side_zi = np.zeros((self.side_hp.shape[0], 2))
        self.gr_db: list[float] = []            # per-bar max gain reduction, for diagnostics

    def process(self, x: np.ndarray) -> np.ndarray:
        n = x.shape[1]
        x = x * self.gain

        # low end to mono
        mid, side = (x[0] + x[1]) * 0.5, (x[0] - x[1]) * 0.5
        side, self.side_zi = signal.sosfilt(self.side_hp, side, zi=self.side_zi)
        x = soft_clip(np.stack([mid + side, mid - side]))

        # look-ahead limiter. `full` = the delayed tail of the last bar + this bar; we output its first n
        full = np.concatenate([self.delay, x], axis=1)
        self.delay = full[:, n:].copy()
        peak = np.max(np.abs(full), axis=0)
        req = np.minimum(1.0, CEILING / np.maximum(peak, 1e-9))
        # m[j] = min(req[j .. j+la]): the gain needed by anything arriving within the look-ahead
        m = minimum_filter1d(req, size=self.la + 1, mode="nearest")[self.la // 2: self.la // 2 + n]
        # attack: average m over the previous la samples -> a smooth ramp that reaches the target in time
        mm = np.concatenate([self.m_hist, m])
        c = np.concatenate([[0.0], np.cumsum(mm)])
        s = (c[self.la + 1:] - c[1:n + 1]) / self.la
        s = np.minimum(s, m)
        self.m_hist = m[-self.la:].copy()
        # release: h = 1 - gain decays exponentially but never below what `s` demands.
        # h[j] = max_k u[k] * r^(j-k)  ->  a running max in the log domain (vectorised, no Python loop)
        u = np.maximum(1.0 - s, 1e-12)
        k = np.arange(n)
        lg = np.log(u) - k * self.log_rel
        lg = np.maximum.accumulate(np.concatenate([[np.log(max(self.h_prev, 1e-12)) + self.log_rel], lg]))[1:]
        h = np.exp(lg + k * self.log_rel)
        g = 1.0 - np.minimum(h, 1.0)
        self.h_prev = float(h[-1])
        self.gr_db.append(float(20 * np.log10(max(g.min(), 1e-6))))
        if len(self.gr_db) > 4096:
            del self.gr_db[:2048]

        out = full[:, :n] * g
        return np.clip(out, -CEILING, CEILING)  # safety: the smoothing can leave a stray sample
