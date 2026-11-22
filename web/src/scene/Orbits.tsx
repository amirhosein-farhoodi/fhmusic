import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const RINGS = [
  { r: 3.25, tilt: [1.25, 0.2, 0], color: PALETTE.lavender, speed: 1, opacity: 0.55 },
  { r: 3.9, tilt: [1.05, -0.5, 0.3], color: PALETTE.bubblegum, speed: -0.5, opacity: 0.35 },
  { r: 4.6, tilt: [1.6, 0.6, -0.2], color: PALETTE.grape, speed: 0.25, opacity: 0.5 },
] as const;

/**
 * Thin orbit rings spinning in time with the BPM (ring 1 = one turn every 4 bars).
 * A build-up folds them flat into one plane, like a machine locking into place;
 * the drop throws them back open.
 */
export function Orbits() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const f = features;
    const turnsPerSec = f.playing ? f.bpm / 60 / 16 : 0.03;
    const fold = f.build * f.build;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const ring = RINGS[i];
      m.rotation.z += dt * turnsPerSec * Math.PI * 2 * ring.speed * (1 + fold * 3 + f.drop * 2);
      m.rotation.x = ring.tilt[0] + (Math.PI / 2 - ring.tilt[0]) * fold + Math.sin(f.time * 0.3 + i) * 0.15 * f.drop;
      m.rotation.y = ring.tilt[1] * (1 - fold);
      const s = 1 + f.kick * 0.035 * (i + 1) + f.mid * 0.04 + f.snare * 0.025 + f.drop * 0.25 * (i + 1) - fold * 0.08;
      m.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, ring.opacity * (0.6 + f.energy * 0.6) + fold * 0.3 + f.drop * 0.6) * (1 - f.calm * 0.45);
    });
  });
  return (
    <>
      {RINGS.map((ring, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} rotation={ring.tilt as unknown as THREE.Euler}>
          <torusGeometry args={[ring.r, 0.012, 8, 256]} />
          <meshBasicMaterial color={ring.color} transparent toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

const RIPPLES = 6;

/** A ripple rolls out across the floor on every kick; the drop sends one huge shockwave. */
export function KickRipples() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const shock = useRef<THREE.Mesh>(null);
  const state = useRef({ age: new Array(RIPPLES).fill(99), next: 0, lastKick: 0, lastDrop: 0, shockAge: 99 });
  useFrame((_, dt) => {
    const st = state.current;
    const f = features;
    if (f.kick > 0.95 && st.lastKick <= 0.95) {
      st.age[st.next] = 0;
      st.next = (st.next + 1) % RIPPLES;
    }
    st.lastKick = f.kick;
    if (f.drop > 0.95 && st.lastDrop <= 0.95) st.shockAge = 0;
    st.lastDrop = f.drop;

    refs.current.forEach((m, i) => {
      if (!m) return;
      st.age[i] += dt;
      const a = st.age[i];
      // ripples roll out faster and brighter at the peak
      m.scale.setScalar(1 + a * (6 + f.mood * 3));
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - a * 0.55) * (0.7 + f.mood * 0.5);
    });

    st.shockAge += dt;
    const s = shock.current!;
    const a = st.shockAge;
    s.visible = a < 2.5;
    s.scale.setScalar(1 + a * 16);
    (s.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - a * 0.45) * f.motion;
  });
  return (
    <group position={[0, -1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {Array.from({ length: RIPPLES }, (_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)}>
          <ringGeometry args={[0.95, 1, 96]} />
          <meshBasicMaterial color={PALETTE.lavender} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={shock} visible={false}>
        <ringGeometry args={[0.9, 1, 128]} />
        <meshBasicMaterial color={PALETTE.butter} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
