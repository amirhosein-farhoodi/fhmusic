"""The DJ: runs the set, picks styles along an energy arc, mixes tracks.

Audio is produced one bar at a time. Tracks overlap-add into long buses so
tails spill naturally into following bars:
  * dry    -- drums, never ducked
  * duck   -- bass, music, reverb returns: side-chained to the kick (the pump)
  * rumble -- kick -> dark reverb -> distortion -> low-pass

Transitions are DJ-style: the next track (in a compatible key: same root, a
fourth or a fifth) fades in under the outro with its lows EQ'd out (thin kick,
no bass), the low end swaps at the halfway point, the outgoing track fades
out, and the tempo glides to the new BPM.

The summed buses go through the master chain (master.py): mono low end, soft
clipper, look-ahead limiter.
"""

from collections import deque

import numpy as np
from scipy import signal

from . import synth
from .master import Master
from .style import pick_bpm, pick_style
from .synth import SR
from .track import SECTION_KINDS, BarCtx, Section, Track

BUS_SECONDS = 20
BPM_RANGE = (100.0, 171.0)  # 171 is Negin's BPM
SKIP_BARS = 4  # length of the quick mix when the user presses "next"
CHANNELS = ("kick", "drums", "bass", "synths", "atmos")
# DJ performance pads: sections inserted right now, then the track carries on
PERFORM = {
    "build": [("tension", 4), ("peak", 16)],
    "drop": [("peak", 16)],
    "breakdown": [("breakdown", 8), ("tension", 4), ("peak", 16)],
}
LOOP_CHOICES = (0, 1, 2, 4)
SC_DEPTH = 0.6       # side-chain pump: how far the kick ducks bass/music (0.6 = about -8 dB)
RUMBLE_LEVEL = 0.3
MASTER_GAIN = 0.85  # drive into the master clipper/limiter; sets how loud the set is (about -8 LUFS)
# Harmonic mixing: the next track's root is the same note, a fourth or a fifth away,
# so the two tracks' drones and basses agree while they overlap.
KEY_MOVES = ((0, 0.4), (5, 0.3), (7, 0.3))


class Engine:
    def __init__(self, seed: int | None = None, bpm: float | None = None, style: str | None = None):
        self.rng = np.random.default_rng(seed)
        self.locked_style = style
        self.intensity = 0.35
        st = pick_style(self.rng, self.intensity, locked=style)
        self.bpm = float(bpm) if bpm else pick_bpm(self.rng, st, self.intensity)
        self.target_bpm = self.bpm
        self.cur = Track(self.rng, st)
        self.master = Master(MASTER_GAIN)
        self.nxt: Track | None = None
        self.track_no = 1
        self.sample_pos = 0
        self.last_status: dict = {}
        self.user_bpm: float | None = None   # set when the user takes over the tempo
        self.commands: deque = deque()        # thread-safe queue of live controls
        self.mix = {c: 1.0 for c in CHANNELS}  # DJ channel faders
        self.history: deque = deque(maxlen=max(LOOP_CHOICES))  # last bars, for looping
        self.loop_bars = 0
        self.loop_pos = 0

        n = BUS_SECONDS * SR
        self.dry = np.zeros((2, n))
        self.duck = np.zeros((2, n))
        self.rumble = np.zeros(n)
        self.rumble_sos = signal.butter(4, 140 / (SR / 2), output="sos")
        self.rumble_zi = np.zeros((self.rumble_sos.shape[0], 2))

    def _next_intensity(self) -> float:
        n = self.track_no + 1
        if n <= 3:
            return [0.35, 0.55, 0.7][n - 1]
        if self.rng.random() < 0.15:
            return 0.45  # breather
        return float(np.clip(self.intensity + self.rng.normal(0, 0.15), 0.6, 1.0))

    def _spawn_next(self):
        self.intensity = self._next_intensity()
        st = pick_style(self.rng, self.intensity, prev_key=self.cur.style.key, locked=self.locked_style)
        self.target_bpm = self.user_bpm or pick_bpm(self.rng, st, self.intensity, prev_bpm=self.bpm)
        self.nxt = self._new_track(st)

    def _new_track(self, st) -> Track:
        moves, w = zip(*KEY_MOVES)
        pc = (self.cur.root_midi + int(self.rng.choice(moves, p=w))) % 12
        return Track(self.rng, st, root_midi=28 + (pc - 28) % 12)  # E1 .. D#2

    # ------------------------------------------------------------------ live controls

    def command(self, name: str, value=None):
        """Queue a live control. Safe to call from another thread; applied at the next bar.
        name: 'bpm' (float) | 'bpm_auto' | 'style' (key or None) | 'next'
              | 'mix' ({channel: gain}) | 'perform' ('build'|'drop'|'breakdown') | 'loop' (0|1|2|4)"""
        self.commands.append((name, value))

    def _apply_commands(self):
        while self.commands:
            name, value = self.commands.popleft()
            if name == "bpm":
                self.user_bpm = float(np.clip(value, *BPM_RANGE))
                self.target_bpm = self.user_bpm
            elif name == "bpm_auto":
                self.user_bpm = None
            elif name == "style":
                self.locked_style = value
                if value is not None:
                    if self.nxt is not None:  # already mixing: swap the incoming track
                        self.nxt = self._new_track(pick_style(self.rng, self.intensity, locked=value))
                    else:
                        self._skip()
            elif name == "next":
                self.loop_bars = 0
                self._skip()
            elif name == "mix":
                for ch, g in value.items():
                    if ch in self.mix:
                        self.mix[ch] = float(np.clip(g, 0.0, 1.5))
            elif name == "perform":
                self._perform(value)
            elif name == "loop":
                self.loop_bars = value if value in LOOP_CHOICES else 0
                self.loop_pos = 0

    def _perform(self, action: str):
        """DJ pads: jump into a build-up, a drop or a breakdown right now."""
        if action not in PERFORM or self.nxt is not None:  # not while mixing tracks
            return
        self.loop_bars = 0
        t = self.cur
        new = []
        for kind, bars in PERFORM[action]:
            e, core, pool = SECTION_KINDS[kind]
            new.append(Section(kind, bars, e, set(core), set(pool)))
        t.sections = t.sections[:t.sec_idx + 1] + new + t.sections[t.sec_idx + 1:]
        t.sec_idx += 1
        t.bar_in_sec = 0
        t.finished = False

    def _skip(self):
        """Start a quick DJ mix into the next track (or finish the current mix now)."""
        if self.nxt is not None:
            self.cur, self.nxt = self.nxt, None
            self.track_no += 1
            return
        t = self.cur
        e, core, pool = SECTION_KINDS["outro"]
        t.sections = t.sections[:t.sec_idx + 1] + [Section("outro", SKIP_BARS, e, set(core), set(pool))]
        t.sec_idx += 1
        t.bar_in_sec = 0
        t.finished = False

    def render_bar(self) -> np.ndarray:
        """Render the next bar. Returns stereo float array, shape (2, n)."""
        self._apply_commands()
        if self.loop_bars and self.history:  # replay the last N bars; the set waits
            bars = list(self.history)[-self.loop_bars:]
            audio, st = bars[self.loop_pos % len(bars)]
            self.loop_pos += 1
            self.last_status = dict(st, loop=self.loop_bars)
            return audio.copy()
        glide = 0.5 if self.user_bpm else 0.12  # user changes land fast, DJ drifts slowly
        self.bpm += (self.target_bpm - self.bpm) * glide
        if abs(self.target_bpm - self.bpm) < 0.05:
            self.bpm = self.target_bpm
        step = 60 / self.bpm / 4 * SR
        bar_len = int(round(16 * step))
        ctx = BarCtx(step, bar_len, self.dry, self.duck, self.rumble, self.sample_pos, self.mix)
        cur = self.cur

        if self.nxt is None and cur.section.kind == "outro" and cur.bar_in_sec == 0:
            self._spawn_next()

        if self.nxt is not None:
            k, total = cur.bar_in_sec, cur.section.bars
            half = max(1, total // 2)
            swap = k >= half
            in_rest = min(1.0, (k + 1) / half)
            out_rest = 1.0 if k < half else max(0.0, 1 - (k - half + 1) / max(1, total - half))
            # DJ bass swap: the track without the low end still plays, just with its lows EQ'd out
            o1 = cur.render_bar(ctx, out_rest, low_cut=swap, events=False)
            o2 = self.nxt.render_bar(ctx, in_rest, low_cut=not swap, events=False)
            kicks, mutes = o1.kick_at + o2.kick_at, []
            status = dict(cur.last_status, track_no=self.track_no, bpm=self.bpm)
            status["next"] = f"{self.nxt.name} ({self.nxt.style.name})"
            if cur.finished:
                self.cur, self.nxt = self.nxt, None
                self.track_no += 1
        else:
            o = cur.render_bar(ctx)
            kicks, mutes = o.kick_at, o.mute
            status = dict(cur.last_status, track_no=self.track_no, bpm=self.bpm)
        status.update(style_key=status.get("style_key", self.cur.style.key), target_bpm=self.target_bpm,
                      bpm_locked=self.user_bpm is not None, locked_style=self.locked_style,
                      bar_len=bar_len, kicks=[k / bar_len for k in sorted(set(kicks))], loop=0)
        self.last_status = status

        # side-chain envelope
        g = np.ones(bar_len)
        tau, att = step * 1.2, 0.002 * SR
        for at in kicks:
            t = np.arange(bar_len - at)
            g[at:] = np.minimum(g[at:], 1 - SC_DEPTH * np.minimum(1, t / att) * np.exp(-t / tau))

        r = synth.drive(self.rumble[:bar_len] * 0.5, self.cur.rumble_drive)
        r, self.rumble_zi = signal.sosfilt(self.rumble_sos, r, zi=self.rumble_zi)
        out = self.dry[:, :bar_len] + self.duck[:, :bar_len] * g + (r * g * RUMBLE_LEVEL)[None, :]

        # silences (stops, the gap before a drop)
        if mutes:
            gate = np.ones(bar_len)
            ramp = int(0.004 * SR)
            for a, b in mutes:
                gate[a:b] = 0
                gate[max(0, a - ramp):a] = np.minimum(gate[max(0, a - ramp):a],
                                                      np.linspace(1, 0, a - max(0, a - ramp)))
            out *= gate
        out = self.master.process(out)

        for bus in (self.dry, self.duck):
            bus[:, :-bar_len] = bus[:, bar_len:]
            bus[:, -bar_len:] = 0
        self.rumble[:-bar_len] = self.rumble[bar_len:]
        self.rumble[-bar_len:] = 0
        self.sample_pos += bar_len
        self.history.append((out.copy(), self.last_status))
        return out
