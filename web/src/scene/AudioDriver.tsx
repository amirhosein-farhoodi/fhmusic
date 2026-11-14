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

export function AudioDriver() {
  const data = useMemo(() => new Uint8Array(1024), []);
  const last = useRef({ id: -1, p: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const f = features;
    const playing = useDJ.getState().status === "playing";
    f.playing = playing;

    let bass = 0, mid = 0, high = 0;
    if (playing && player.analyser) {
      player.analyser.getByteFrequencyData(data);
      // bin width = 48000 / 2048 = 23.4 Hz
      bass = avg(data, 1, 7);
      mid = avg(data, 7, 80);
      high = avg(data, 80, 400);
    }
    f.bass = follow(f.bass, Math.pow(bass, 1.6) * 1.4, dt);
    f.mid = follow(f.mid, mid * 1.6, dt);
    f.high = follow(f.high, high * 2.2, dt, 30, 8);

    const m = player.current;
    if (playing && m) {
      const p = player.barProgress();
      if (m.id !== last.current.id) last.current = { id: m.id, p: -1e-3 };
      for (const k of m.kicks) if (last.current.p < k && k <= p) f.kick = 1;
      last.current.p = p;
      f.barProgress = Math.min(Math.max(p, 0), 0.9999);
      f.step = f.barProgress * 16;
      f.energy = follow(f.energy, m.energy, dt, 2, 2);
      f.bpm = m.bpm;
      f.section = m.section;
    } else {
      f.energy = follow(f.energy, 0.25, dt, 1, 1);
    }
    f.kick *= Math.exp(-dt * 7);
    f.time += dt * (playing ? 0.35 + (f.bpm / 140) * 0.75 : 0.2);
  }, -1);

  return null;
}
