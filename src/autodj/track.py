"""A Track: one 'record' in the set, designed from a Style.

Each track gets its own sounds, key/scale, grooves, instrumentation and a
generated arrangement. While playing, it evolves continuously:
  * polymetric lanes drift against each other
  * per-voice modulators sweep timbre, cutoff and pan
  * optional layers rotate in/out every 8 bars
  * motifs develop, lanes mutate
  * events: fills, drum cuts, full stops, kick rolls, risers, drops
"""

from dataclasses import dataclass, field

import numpy as np
from scipy import signal

from . import patterns as P
from . import synth
from .style import NOTE_NAMES, SCALES, Style
from .synth import SR, Bank, midi_hz

ADJ = ["Rust", "Concrete", "Furnace", "Static", "Iron", "Black", "Voltage", "Sulfur", "Chrome",
       "Hydraulic", "Carbon", "Feedback", "Broken", "Cold", "Toxic", "Steel", "Ash", "Neon"]
NOUN = ["Cathedral", "Engine", "Protocol", "Bunker", "Pressure", "Signal", "Foundry", "Ritual",
        "Machine", "Grid", "Reactor", "Tunnel", "Assembly", "Pulse", "Doctrine", "Furnace", "Body"]

# kind: (target energy, core layers, optional pool)
SECTION_KINDS = {
    "intro": (0.35, {"kick", "hat_c"}, {"perc1", "perc2", "rumble", "texture", "noise", "atmos"}),
    "groove": (0.65, {"kick", "rumble", "bass", "hat_c"},
               {"hat_o", "snare", "perc1", "perc2", "perc3", "noise", "stab", "arp", "texture", "voice", "pad",
                "lead", "atmos"}),
    "tension": (0.85, {"kick", "rumble", "hat_c", "perc1"},
                {"bass", "hat_o", "perc2", "perc3", "noise", "arp", "lead", "voice", "texture", "stab"}),
    "peak": (0.95, {"kick", "rumble", "bass", "hat_c", "hat_o"},
             {"snare", "perc1", "perc2", "perc3", "noise", "stab", "lead", "arp", "voice", "pad"}),
    "breakdown": (0.3, {"atmos"}, {"pad", "lead", "voice", "arp", "texture", "stab", "hat_c"}),
    "break": (0.45, set(), {"pad", "lead", "voice", "arp", "texture", "stab", "atmos"}),
    "stripped": (0.75, {"kick", "rumble"}, {"perc1", "perc2", "perc3", "noise", "hat_c"}),
    "outro": (0.5, {"kick", "rumble", "hat_c"}, {"perc1", "perc2", "texture", "noise", "atmos"}),
}
MELODIC = ("pad", "lead", "voice", "arp", "stab")
MAX_CACHE = 600


@dataclass
class Section:
    kind: str
    bars: int
    energy: float
    core: set
    pool: set


@dataclass
class BarCtx:
    step: float          # samples per 16th
    bar_len: int
    dry: np.ndarray      # (2, N) never ducked
    duck: np.ndarray     # (2, N) side-chained to the kick
    rumble: np.ndarray   # (N,) rumble bus
    sample_pos: int      # absolute position (for phase-continuous drones)


@dataclass
class BarOut:
    kick_at: list = field(default_factory=list)
    mute: list = field(default_factory=list)  # (start, end) sample ranges of silence


class Mod:
    """Slow modulator: sine LFO + random walk, each voice at its own speed."""

    def __init__(self, rng):
        self.rng = rng
        self.period = rng.uniform(4, 24)
        self.phase = rng.uniform()
        self.walk = 0.0
        self.t = 0
        self.value = 0.5

    def tick(self):
        self.t += 1
        self.walk = float(np.clip(0.85 * self.walk + self.rng.normal(0, 0.12), -1, 1))
        lfo = np.sin(2 * np.pi * (self.t / self.period + self.phase))
        self.value = float(np.clip(0.5 + 0.35 * lfo + 0.25 * self.walk, 0, 1))


def plan_sections(rng, s: Style) -> list[Section]:
    seq = [("intro", rng.choice([8, 16])), ("groove", rng.choice([16, 24, 32]))]
    for _ in range(int(rng.integers(1, 3))):
        if rng.random() < 0.6:
            seq.append(("tension", rng.choice([8, 16])))
        seq.append(("peak", rng.choice([16, 32])))
        r = rng.random()
        if r < 0.15 + 0.4 * s.breaks:
            seq.append(("break", rng.choice([2, 4])))
        elif r < 0.8:
            seq.append(("breakdown", rng.choice([8, 16])))
        else:
            seq.append(("stripped", rng.choice([8, 16])))
    seq.append(("peak" if rng.random() < 0.5 else "groove", 16))
    seq.append(("outro", 16))
    out = []
    for kind, bars in seq:
        e, core, pool = SECTION_KINDS[kind]
        out.append(Section(kind, int(bars), e, set(core), set(pool)))
    return out


class Track:
    def __init__(self, rng, style: Style):
        self.rng = rng
        self.style = s = style
        self.name = f"{rng.choice(ADJ)} {rng.choice(NOUN)}"
        self.scale_name = str(rng.choice(list(s.scales)))
        self.scale = SCALES[self.scale_name]
        self.root_midi = int(rng.integers(28, 35))  # E1 .. A#1
        self.root = midi_hz(self.root_midi)

        def seed():
            return int(rng.integers(2 ** 31))

        # ---- sound design
        self.kick = synth.kick(rng, s.distortion)
        self.hat_c = Bank(lambda r, m: synth.hat(r, False, m), seed())
        self.hat_o = Bank(lambda r, m: synth.hat(r, True, m), seed())
        snare_fn = synth.clap if rng.random() < 0.5 else synth.snare
        self.snare = Bank(lambda r, m: snare_fn(r, m), seed(), n=4)
        kinds = rng.choice(synth.PERC_KINDS, size=3, replace=False)
        self.percs = [Bank(lambda r, m, k=str(k): synth.perc(r, m, k), seed()) for k in kinds]
        self.noise = Bank(lambda r, m: synth.noise_hit(r, m), seed())
        self.impact = synth.impact(rng)
        self.reverb_ir = synth.reverb_ir(rng, 1.2 + 2.8 * s.space * rng.uniform(0.7, 1.2))
        self.rumble_ir = synth.rumble_ir(rng)
        self.rumble_drive = 1.5 + 5 * s.distortion
        self.wet = 0.2 + 0.25 * s.space

        # ---- rhythm
        g = s.groove
        self.kick_lane = P.kick_lane(rng)
        self.hat_lane = P.hat_lane(rng, g)
        self.hat_o_lane = P.open_hat_lane(rng)
        self.snare_lane = P.snare_lane(rng)
        self.perc_lanes = [P.euclid_lane(rng, P.lane_length(rng, g), rng.uniform(0.15, 0.45), ghost=g * 0.3)
                           for _ in range(3)]
        self.perc_pan = [float(rng.uniform(-0.7, 0.7)) for _ in range(3)]
        self.noise_lane = P.euclid_lane(rng, P.lane_length(rng, g), rng.uniform(0.1, 0.3))
        self.swing = s.swing * rng.uniform(0.6, 1.3)

        # ---- bass
        self.bass_mode = str(rng.choice(list(s.bass_modes)))
        self.bass = P.make_bass(rng, self.bass_mode, g)
        self.bass_wave = {"ebm": "square", "sub": "sub"}.get(self.bass_mode, str(rng.choice(["saw", "saw", "square"])))
        self.bass_cut = rng.uniform(250, 700)
        self.bass_drive = 1.2 + 4 * s.distortion * rng.uniform(0.6, 1.2)

        # ---- harmony & melody
        self.progression = P.PROGRESSIONS[rng.integers(len(P.PROGRESSIONS))]
        self.chord_bars = int(rng.choice([2, 4, 4, 8]))
        self.chord_kind = str(rng.choice(["triad", "triad", "seventh", "sus", "power"]))
        self.lead_base = P.make_motif(rng, int(rng.choice([16, 32, 12, 24])), rng.uniform(0.15, 0.4))
        self.lead = self.lead_base
        self.lead_wave = str(rng.choice(["saw", "square"]))
        self.lead_oct = int(rng.choice([24, 36]))
        self.lead_reso = float(rng.uniform(0.2, 0.9))
        self.arp = P.make_arp(rng)
        self.voice_motif = P.make_motif(rng, int(rng.choice([32, 64])), rng.uniform(0.05, 0.12), span=3)
        self.vowels = [str(v) for v in rng.choice(list("aeiou"), size=3)]
        self.stab_lane = P.euclid_lane(rng, int(rng.choice([16, 32])), rng.uniform(0.06, 0.15))
        self.texture_kind = str(rng.choice(["machine", "radio", "siren", "drone"]))
        self.delay_steps = int(rng.choice([3, 3, 6, 2]))

        # ---- instrumentation for this track
        en = {"kick", "rumble", "bass", "hat_c", "hat_o", "perc1", "perc2", "atmos"}
        chances = {"snare": 0.85, "perc3": 0.3 + 0.7 * g, "noise": s.noise, "stab": 0.3 + 0.5 * s.harmony,
                   "lead": s.melody, "arp": 0.8 * s.melody, "pad": s.harmony, "voice": s.voice, "texture": 0.6}
        en |= {k for k, p in chances.items() if rng.random() < p}
        if not en & set(MELODIC):
            en.add(str(rng.choice(["pad", "stab", "lead", "voice"])))
        self.enabled = en

        self.mods = {k: Mod(rng) for k in
                     ("hat", "perc0", "perc1", "perc2", "noise", "bass", "lead", "stab", "pad", "snare", "pan")}
        self.sections = plan_sections(rng, s)
        self.sec_idx = 0
        self.bar_in_sec = 0
        self.bar = 0
        self.finished = False
        self.energy = 0.3
        self.sec_start_energy = 0.3
        self.layers: set = set()
        self.optional: set = set()
        self.levels = {"atmos": 0.0, "texture": 0.0}
        self.cache: dict = {}

    # ------------------------------------------------------------------ helpers

    @property
    def section(self) -> Section:
        return self.sections[self.sec_idx]

    @property
    def key_name(self) -> str:
        return f"{NOTE_NAMES[self.root_midi % 12]} {self.scale_name}"

    def status(self) -> dict:
        s = self.section
        return dict(track=self.name, style=self.style.name, style_key=self.style.key, key=self.key_name, section=s.kind,
                    bar=self.bar_in_sec + 1, bars=s.bars, energy=self.energy, layers=sorted(self.layers))

    def _cached(self, key, fn):
        if key not in self.cache:
            if len(self.cache) > MAX_CACHE:
                self.cache.clear()
            self.cache[key] = fn()
        return self.cache[key]

    def _chord_midis(self, root_deg: int, octave: int) -> list[int]:
        return [self.root_midi + octave + P.deg_semi(d, self.scale)
                for d in P.chord_degrees(root_deg, self.chord_kind)]

    def _choose_layers(self, section_start: bool):
        rng, sec = self.rng, self.section
        core = sec.core & self.enabled
        pool = sorted(sec.pool & self.enabled)
        if section_start or not self.optional <= set(pool):
            k = min(len(pool), int(round(len(pool) * (0.2 + 0.55 * sec.energy))))
            self.optional = {str(x) for x in rng.choice(pool, size=k, replace=False)} if k else set()
        else:  # evolve: one out, one or two in
            if self.optional and rng.random() < 0.7:
                self.optional.discard(str(rng.choice(sorted(self.optional))))
            cand = [p for p in pool if p not in self.optional]
            for _ in range(int(rng.integers(1, 3))):
                if cand:
                    c = str(rng.choice(cand))
                    self.optional.add(c)
                    cand.remove(c)
        if sec.kind in ("breakdown", "break"):  # make sure there's music in the background
            mel = [x for x in MELODIC if x in self.enabled]
            if mel and not self.optional & set(mel):
                self.optional |= {str(x) for x in rng.choice(mel, size=min(2, len(mel)), replace=False)}
        self.layers = core | self.optional

    def _advance(self):
        rng = self.rng
        self.bar += 1
        self.bar_in_sec += 1
        if self.bar % 16 == 0 and rng.random() < 0.6:
            self.lead = P.vary_motif(rng, self.lead_base if rng.random() < 0.5 else self.lead)
        if self.bar % 32 == 0 and rng.random() < 0.5:
            self.voice_motif = P.vary_motif(rng, self.voice_motif)
        if self.bar % 8 == 0 and rng.random() < 0.5:
            r = rng.random()
            if r < 0.5:
                i = int(rng.integers(3))
                self.perc_lanes[i] = P.mutate_lane(rng, self.perc_lanes[i], self.style.groove)
            elif r < 0.75:
                self.bass = P.respice_bass(rng, self.bass)
            elif r < 0.9:
                self.noise_lane = P.mutate_lane(rng, self.noise_lane, self.style.groove)
            else:
                self.stab_lane = P.mutate_lane(rng, self.stab_lane, 0.0)
        if self.bar_in_sec >= self.section.bars:
            self.bar_in_sec = 0
            if self.sec_idx + 1 < len(self.sections):
                self.sec_idx += 1
            else:
                self.finished = True  # keeps looping the outro until the engine switches

    # ------------------------------------------------------------------ render

    def render_bar(self, ctx: BarCtx, gain_low: float = 1.0, gain_rest: float = 1.0,
                   events: bool = True) -> BarOut:
        """Render this track's next bar into the engine buses.

        gain_low: kick/rumble/bass level (DJ bass swap), gain_rest: everything else.
        events: allow stops/fills/drops (off during DJ transitions)."""
        rng, s, sec = self.rng, self.style, self.section
        b = self.bar_in_sec
        last = b == sec.bars - 1
        nxt = self.sections[self.sec_idx + 1].kind if self.sec_idx + 1 < len(self.sections) else None
        prev = self.sections[self.sec_idx - 1].kind if self.sec_idx else None
        step, bar_len = ctx.step, ctx.bar_len
        gs0 = self.bar * 16
        out = BarOut()

        if b % 8 == 0:
            self._choose_layers(b == 0)
        L = self.layers
        for m in self.mods.values():
            m.tick()
        M = {k: m.value for k, m in self.mods.items()}

        if b == 0:
            self.sec_start_energy = self.energy
        if sec.kind == "tension":
            self.energy = self.sec_start_energy + (sec.energy - self.sec_start_energy) * (b + 1) / sec.bars
        else:
            self.energy += (sec.energy - self.energy) * 0.4
        e = self.energy

        send = np.zeros((2, bar_len + 3 * SR))
        rsend = np.zeros(bar_len + SR)

        def pos(st, swing=False):
            return int(st * step + (self.swing * step if swing and st % 2 else 0))

        def place(bus, x, at, gain, pan=0.0, rev=0.0, delay=0.0):
            if gain <= 0 or at >= bus.shape[-1]:
                return
            if x.ndim == 1:
                ang = (np.clip(pan, -1, 1) + 1) * np.pi / 4
                gl, gr = np.cos(ang) * np.sqrt(2), np.sin(ang) * np.sqrt(2)
                xl, xr = x * gl, x * gr
            else:
                xl, xr = x[0], x[1]
            n = min(len(xl), bus.shape[-1] - at)
            bus[0, at:at + n] += xl[:n] * gain
            bus[1, at:at + n] += xr[:n] * gain
            if rev:
                n = min(len(xl), send.shape[-1] - at)
                if n > 0:
                    send[0, at:at + n] += xl[:n] * gain * rev
                    send[1, at:at + n] += xr[:n] * gain * rev
            if delay:  # ping-pong echoes
                xm = x if x.ndim == 1 else x.mean(axis=0)
                for k in range(1, 4):
                    place(ctx.duck, xm, at + int(k * self.delay_steps * step), gain * delay * 0.55 ** (k - 1),
                          0.7 if k % 2 else -0.7, rev * 0.5)

        # ---------------- events
        event = None
        if events and b % 8 == 7 and not last and sec.kind in ("groove", "peak", "tension", "stripped"):
            r = rng.random()
            if r < 0.12 * s.breaks:
                event = "stop"
            elif r < 0.12 * s.breaks + 0.25:
                event = "drumcut"
            elif r < 0.6:
                event = "fill"
        predrop = (events and last and sec.kind in ("tension", "breakdown", "break", "stripped")
                   and nxt in ("peak", "groove", "tension"))
        drop = events and b == 0 and (sec.kind == "peak" or prev in ("breakdown", "break"))
        kick_roll = predrop and sec.kind == "tension" and rng.random() < 0.5
        if event == "stop":
            out.mute.append((pos(8), bar_len))
        if predrop and rng.random() < 0.3 + 0.4 * s.breaks:
            out.mute.append((pos(12), bar_len))  # the silence before the drop

        def drums_on(st):
            return not (event in ("drumcut", "stop") and st >= 8)

        cut_end = event == "fill" or predrop  # drop kick/bass on the last beat

        # ---------------- kick + rumble
        if "kick" in L and gain_low > 0:
            for st in range(16):
                v, _ = self.kick_lane.at(st)
                if kick_roll and st >= 8:
                    v = 0.5 + 0.5 * (st - 8) / 7
                elif v <= 0 or not drums_on(st) or (cut_end and st >= 12):
                    continue
                at = pos(st)
                place(ctx.dry, self.kick, at, 0.85 * v * gain_low)
                if "rumble" in L:
                    n = min(len(self.kick), len(rsend) - at)
                    rsend[at:at + n] += self.kick[:n] * v * s.rumble * gain_low
                if v >= 0.9:
                    out.kick_at.append(at)

        # ---------------- drums
        if gain_rest > 0:
            if "hat_c" in L:
                x = self.hat_c.pick(M["hat"])
                for st in range(16):
                    v, p = self.hat_lane.at(gs0 + st)
                    if v > 0 and drums_on(st) and (v >= 0.95 or rng.random() < p * (0.5 + 0.5 * e)):
                        place(ctx.dry, x, pos(st, True), 0.17 * v * gain_rest * rng.uniform(0.85, 1.15), 0.15, 0.05)
            if "hat_o" in L:
                x = self.hat_o.pick(1 - M["hat"])
                for st in range(16):
                    v, p = self.hat_o_lane.at(gs0 + st)
                    if v > 0 and drums_on(st) and rng.random() < p:
                        place(ctx.dry, x, pos(st, True), 0.2 * v * gain_rest, -0.1, 0.1)
            if "snare" in L:
                x = self.snare.pick(M["snare"])
                for st in range(16):
                    v, _ = self.snare_lane.at(gs0 + st)
                    if v > 0 and drums_on(st) and not (cut_end and st >= 12):
                        place(ctx.dry, x, pos(st), 0.4 * v * gain_rest, 0.0, 0.25)
            if event == "fill" or (predrop and sec.kind == "tension"):
                x = self.snare.pick(0.2)
                start = 8 if predrop else 12
                for i, st in enumerate(range(start, 16)):
                    place(ctx.dry, x, pos(st), (0.18 + 0.3 * i / (16 - start)) * gain_rest, 0.0, 0.3)
            for i in range(3):
                if f"perc{i + 1}" not in L:
                    continue
                x = self.percs[i].pick(M[f"perc{i}"])
                pan = self.perc_pan[i] + 0.4 * (M["pan"] - 0.5)
                for st in range(16):
                    v, p = self.perc_lanes[i].at(gs0 + st)
                    if v > 0 and drums_on(st) and rng.random() < p * (0.6 + 0.4 * e):
                        place(ctx.dry, x, pos(st, True), 0.24 * v * gain_rest, pan, 0.2 + 0.2 * s.space,
                              0.0)  # no echo: echoed metal = ringing bell
            if "noise" in L:
                x = self.noise.pick(M["noise"])
                for st in range(16):
                    v, p = self.noise_lane.at(gs0 + st)
                    if v > 0 and drums_on(st) and rng.random() < p:
                        place(ctx.dry, x, pos(st), (0.1 + 0.15 * s.noise) * v * gain_rest,
                              float(rng.uniform(-0.5, 0.5)), 0.2)

        # ---------------- bass
        if "bass" in L and gain_low > 0:
            cut = self.bass_cut * (0.4 + 0.9 * e) * (0.7 + 0.6 * M["bass"])
            cq = 2 ** (round(np.log2(cut) * 4) / 4)
            for st in range(16):
                if not drums_on(st) or (cut_end and st >= 12):
                    continue
                v, deg, gate = self.bass.at(gs0 + st)
                if v <= 0:
                    continue
                freq = midi_hz(self.root_midi + 12 + P.deg_semi(deg, self.scale))
                x = self._cached(("bass", deg, gate, cq, round(step)),
                                 lambda: synth.bass_note(freq, gate * step / SR, cq, self.bass_drive, self.bass_wave))
                place(ctx.duck, x, pos(st), 0.4 * v * gain_low)

        # ---------------- harmony & melody
        croot = self.progression[(self.bar // self.chord_bars) % len(self.progression)]
        bg = 2.0 if sec.kind in ("breakdown", "break") else 1.0  # background louder when drums are out
        if gain_rest > 0:
            if "pad" in L and self.bar % self.chord_bars == 0:
                dur = self.chord_bars * 16 * step / SR + 0.6
                x = synth.pad([midi_hz(m) for m in self._chord_midis(croot, 24)], dur, M["pad"], rng)
                place(ctx.duck, x, 0, 0.14 * bg * gain_rest, rev=0.35)
            if "stab" in L:
                mq = round(M["stab"], 1)
                x = self._cached(("stab", croot, mq), lambda: synth.stab(
                    [midi_hz(m) for m in self._chord_midis(croot, 24)], rng, mq))
                for st in range(16):
                    v, _ = self.stab_lane.at(gs0 + st)
                    if v > 0:
                        place(ctx.duck, x, pos(st), 0.17 * v * bg * gain_rest, float(rng.uniform(-0.4, 0.4)),
                              0.45, 0.35)
            if "lead" in L:
                cut = 300 + 3500 * (0.3 + 0.7 * e) * (0.3 + 0.7 * M["lead"])
                cq = 2 ** (round(np.log2(cut) * 3) / 3)
                drv = 1.5 + 2.5 * s.distortion
                for st in range(16):
                    nt = self.lead.notes.get((gs0 + st) % self.lead.length)
                    if not nt:
                        continue
                    deg, ln, v = nt
                    freq = midi_hz(self.root_midi + self.lead_oct + P.deg_semi(deg, self.scale))
                    x = self._cached(("lead", deg, ln, cq, round(step)), lambda: synth.lead_note(
                        freq, ln * step / SR, cq, self.lead_reso, drv, self.lead_wave))
                    place(ctx.duck, x, pos(st, True), 0.13 * v * bg * gain_rest, 0.1, 0.3, 0.35)
            if "arp" in L:
                tones = P.chord_degrees(croot, self.chord_kind)
                cq = 2 ** (round(np.log2(500 + 2500 * M["lead"]) * 3) / 3)
                for st in range(16):
                    g = gs0 + st
                    if g % self.arp.rate:
                        continue
                    idx = (g // self.arp.rate) % len(self.arp.cycle)
                    ci = self.arp.cycle[idx]
                    deg = tones[ci % len(tones)] + 7 * (ci // len(tones))
                    freq = midi_hz(self.root_midi + 36 + P.deg_semi(deg, self.scale))
                    x = self._cached(("arp", deg, cq, round(step)), lambda: synth.lead_note(
                        freq, self.arp.gate * self.arp.rate * step / SR, cq, 0.6, 2.0, "saw"))
                    place(ctx.duck, x, pos(st, True), 0.1 * (1 if idx == 0 else 0.8) * bg * gain_rest,
                          0.4 * np.sin(g * 0.7), 0.25, 0.3)
            if "voice" in L:
                for st in range(16):
                    ms = (gs0 + st) % self.voice_motif.length
                    nt = self.voice_motif.notes.get(ms)
                    if not nt:
                        continue
                    deg, ln, v = nt
                    vowel = self.vowels[ms % len(self.vowels)]
                    freq = midi_hz(self.root_midi + 24 + P.deg_semi(deg, self.scale))
                    length = max(ln, 2) * 2 * step / SR
                    x = self._cached(("voice", deg, ln, vowel, round(step)),
                                     lambda: synth.voice(freq, length, vowel, rng))
                    place(ctx.duck, x, pos(st), 0.2 * v * bg * gain_rest, float(rng.uniform(-0.3, 0.3)), 0.5, 0.4)

        # ---------------- continuous background (cross-faded bar segments)
        for name, lvl in (("atmos", 0.1), ("texture", 0.12)):
            target = (lvl * (2.2 if bg > 1 else 1) if name in L else 0.0) * gain_rest
            cur = self.levels[name]
            if target or cur > 1e-3:
                fade = int(0.05 * SR)
                n = bar_len + fade
                t_abs = (ctx.sample_pos + np.arange(n)) / SR
                seg = (synth.drone(t_abs, self.root, rng) if name == "atmos"
                       else synth.texture(self.texture_kind, t_abs, self.root, rng))
                win = np.ones(n)
                win[:fade] = np.linspace(0, 1, fade)
                win[-fade:] = np.linspace(1, 0, fade)
                ctx.duck[:, :n] += seg * np.linspace(cur, target, n) * win
            self.levels[name] = target

        # ---------------- transitions fx
        if events and sec.kind in ("breakdown", "tension", "break", "stripped") and nxt in ("peak", "groove", "tension"):
            rb = 2 if sec.bars >= 4 else 1
            if b == sec.bars - rb:
                place(ctx.dry, synth.riser(rng, rb * bar_len / SR), 0, 0.3 * gain_rest)
        if drop:
            place(ctx.dry, self.impact, 0, 0.55, rev=0.5)
        if events and b == 0 and sec.kind in ("break", "breakdown"):
            place(ctx.dry, synth.riser(rng, bar_len / SR)[::-1].copy(), 0, 0.2)  # down-lifter

        # ---------------- reverb + rumble (overlap-add convolution)
        if send.any():
            wet = signal.fftconvolve(send, self.reverb_ir, axes=1)
            n = min(wet.shape[1], ctx.duck.shape[1])
            ctx.duck[:, :n] += wet[:, :n] * self.wet
        if rsend.any():
            rw = signal.fftconvolve(rsend, self.rumble_ir)
            n = min(len(rw), len(ctx.rumble))
            ctx.rumble[:n] += rw[:n]

        self.last_status = self.status()
        self._advance()
        return out
