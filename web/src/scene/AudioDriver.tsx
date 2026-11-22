import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { player } from "../audio/player";
import { useDJ } from "../store";
import { features } from "./features";

const avg = (d: Uint8Array, a: number, b: number) => {
  let s = 0;
  for (let i = a; i < b; i++) s += d[i];
  return s / (b - a) / 255;
};

/** Fast attack, slower release -- feels punchy without flicker. */
const follow = (cur: number, target: number, dt: number, up = 20, down = 5) =>
  cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? up : down)));

// How "hot" each section looks: 0 dreamy .. 1 peak.
const MOOD: Record<string, number> = {
  intro: 0.35, groove: 0.6, tension: 0.72, peak: 1, breakdown: 0, break: 0.1, stripped: 0.55, outro: 0.4,
};
const CALM = new Set(["breakdown", "break"]);

// 32 log-spaced bands from ~23 Hz to ~16 kHz, for the spectrum wall
const BANDS = Array.from({ length: features.spectrum.length + 1 }, (_, i) =>
  Math.max(i + 1, Math.round(Math.pow(700, i / features.spectrum.length))), // >= 1 bin per band
);

/**
 * Spectral-flux onset detector for one band: fires when the band's energy jumps
 * well above its recent average. `floor` keeps silence and noise from triggering it.
 */
class Onset {
  private prev = 0;
  private mean = 0.02;
  private onKick = 0.02; // typical jump when only the kick hits (so a kick isn't read as a snare)
  private hold = 0;
  constructor(private ratio: number, private floor: number, private refractory: number) {}

  /** Returns hit strength 0..1 (0 = no onset this frame). */
  update(energy: number, dt: number, kickNow: boolean): number {
    const flux = Math.max(0, energy - this.prev);
    this.prev = energy;
    this.hold -= dt;
    if (kickNow) this.onKick += (flux - this.onKick) * 0.25;
    const threshold = Math.max(this.mean * this.ratio, this.onKick * 1.6, this.floor);
    this.mean += (flux - this.mean) * (1 - Math.exp(-dt * 2));
    if (flux > threshold && this.hold <= 0) {
      this.hold = this.refractory;
      return Math.min(1, 0.55 + (flux - threshold) / (threshold * 2));
    }
    return 0;
  }
}

const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const reducedMotion = () => motionQuery?.matches ?? false;

const specFloor = new Float32Array(features.spectrum.length);
const specPeak = new Float32Array(features.spectrum.length);

export function AudioDriver() {
  const data = useMemo(() => new Uint8Array(1024), []);
  const detect = useMemo(
    () => ({ snare: new Onset(2.4, 0.035, 0.09), hat: new Onset(2.0, 0.025, 0.06) }),
    [],
  );
  const last = useRef({ id: -1, p: 0, beat: -1, section: "", track: -1 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const f = features;
    const L = last.current;
    const playing = useDJ.getState().status === "playing";
    f.playing = playing;
    f.motion = reducedMotion() ? 0.35 : 1;

    // ---- exact timeline from the engine: kicks, beats, bars, sections
    let kickNow = false;
    const m = player.current;
    if (playing && m) {
      const p = player.barProgress();
      if (m.id !== L.id) {
        // a new bar is audible
        L.id = m.id;
        L.p = -1e-3;
        if (m.section !== L.section || m.track_no !== L.track) {
          f.phrase++;
          // landing in the peak from anything else is a drop
          if (m.section === "peak" && L.section && L.section !== "peak") f.drop = 1;
        } else if (m.bar > 1 && (m.bar - 1) % 8 === 0) {
          f.phrase++;
        }
        L.section = m.section;
        L.track = m.track_no;
      }
      for (const k of m.kicks) if (L.p < k && k <= p) (f.kick = 1), (kickNow = true);
      L.p = p;

      f.barProgress = Math.min(Math.max(p, 0), 0.9999);
      f.step = f.barProgress * 16;
      f.beat = f.barProgress * 4;
      const beat = Math.floor(f.beat);
      if (beat !== L.beat) {
        L.beat = beat;
        f.beatPulse = 1;
      }

      f.energy = follow(f.energy, m.energy, dt, 2, 2);
      f.bpm = m.bpm;
      f.section = m.section;
      const build = m.section === "tension" ? Math.min(1, (m.bar - 1 + f.barProgress) / m.bars) : 0;
      f.build = follow(f.build, build, dt, 6, 9);
      f.calm = follow(f.calm, CALM.has(m.section) ? 1 : 0, dt, 1.4, 1.8);
      f.mood = follow(f.mood, MOOD[m.section] ?? 0.5, dt, 1.2, 1.2);
    } else {
      f.energy = follow(f.energy, 0.25, dt, 1, 1);
      f.build = follow(f.build, 0, dt, 2, 2);
      f.calm = follow(f.calm, 0.5, dt, 1, 1);
      f.mood = follow(f.mood, 0.3, dt, 1, 1);
    }

    // ---- what is actually heard (after the DJ filter / EQ / mutes)
    let bass = 0, mid = 0, high = 0, snareBand = 0, hatBand = 0;
    if (playing && player.analyser) {
      player.analyser.getByteFrequencyData(data);
      // bin width = 48000 / 2048 = 23.4 Hz
      bass = avg(data, 1, 7);
      mid = avg(data, 7, 80);
      high = avg(data, 80, 400);
      snareBand = avg(data, 43, 170); // ~1-4 kHz: claps and snares
      hatBand = avg(data, 340, 640); // ~8-15 kHz: hats and noise
    }
    for (let i = 0; i < f.spectrum.length; i++) {
      const lo = BANDS[i], hi = Math.max(BANDS[i + 1], lo + 1);
      const v = playing && player.analyser ? avg(data, lo, hi) : 0;
      // Mastered techno sits near the top of the analyser's range, so each band is
      // normalised against its own recent floor and peak: the wall shows movement, not loudness.
      const fl = (specFloor[i] = follow(specFloor[i], v, dt, 0.4, 4));
      const pk = (specPeak[i] = Math.max(v, specPeak[i] - dt * 0.15));
      const rel = Math.min(1, Math.max(0, (v - fl) / Math.max(pk - fl, 0.06)));
      f.spectrum[i] = follow(f.spectrum[i], rel * Math.min(1, v * 1.5), dt, 25, 7);
    }
    f.bass = follow(f.bass, Math.pow(bass, 1.6) * 1.4, dt);
    f.mid = follow(f.mid, mid * 1.6, dt);
    f.high = follow(f.high, high * 2.2, dt, 30, 8);

    const sn = detect.snare.update(snareBand, dt, kickNow);
    if (sn > f.snare) f.snare = sn;
    const ht = detect.hat.update(hatBand, dt, kickNow);
    if (ht > f.hat) f.hat = ht;

    // ---- decays
    f.kick *= Math.exp(-dt * 7);
    f.snare *= Math.exp(-dt * 9);
    f.hat *= Math.exp(-dt * 14);
    f.beatPulse *= Math.exp(-dt * 6);
    f.drop *= Math.exp(-dt * 1.3);

    const tempo = playing ? 0.35 + (f.bpm / 140) * 0.75 : 0.2;
    f.time += dt * tempo * (1 + f.build * 0.7 - f.calm * 0.35);
  }, -1);

  return null;
}
