import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const RINGS = [
  { r: 3.25, tilt: [1.25, 0.2, 0], color: PALETTE.lavender, speed: 1, opacity: 0.55 },
  { r: 3.9, tilt: [1.05, -0.5, 0.3], color: PALETTE.bubblegum, speed: -0.5, opacity: 0.35 },
  { r: 4.6, tilt: [1.6, 0.6, -0.2], color: PALETTE.grape, speed: 0.25, opacity: 0.5 },
] as const;

/** Thin orbit rings spinning in time with the BPM (ring 1 = one turn every 4 bars). */
export function Orbits() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const turnsPerSec = features.playing ? features.bpm / 60 / 16 : 0.03;
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.z += dt * turnsPerSec * Math.PI * 2 * RINGS[i].speed;
      const s = 1 + features.kick * 0.035 * (i + 1) + features.mid * 0.04;
      m.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity = RINGS[i].opacity * (0.6 + features.energy * 0.6);
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

/** A ripple rolls out across the floor on every kick. */
export function KickRipples() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const state = useRef({ age: new Array(RIPPLES).fill(99), next: 0, lastKick: 0 });
  useFrame((_, dt) => {
    const st = state.current;
    if (features.kick > 0.95 && st.lastKick <= 0.95) {
      st.age[st.next] = 0;
      st.next = (st.next + 1) % RIPPLES;
    }
    st.lastKick = features.kick;
    refs.current.forEach((m, i) => {
      if (!m) return;
      st.age[i] += dt;
      const a = st.age[i];
      m.scale.setScalar(1 + a * 6);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - a * 0.55);
    });
  });
  return (
    <group position={[0, -1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {Array.from({ length: RIPPLES }, (_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)}>
          <ringGeometry args={[0.95, 1, 96]} />
          <meshBasicMaterial color={PALETTE.lavender} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
