import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

function starShape(points = 5, outer = 0.32, inner = 0.15) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const fn = i ? s.lineTo.bind(s) : s.moveTo.bind(s);
    fn(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

type Kind = "star" | "donut" | "gem" | "dot";
const KINDS: { kind: Kind; color: string }[] = [
  { kind: "star", color: PALETTE.butter },
  { kind: "donut", color: PALETTE.bubblegum },
  { kind: "gem", color: PALETTE.lavender },
  { kind: "dot", color: PALETTE.butter },
  { kind: "donut", color: PALETTE.lavender },
  { kind: "star", color: PALETTE.bubblegum },
  { kind: "gem", color: PALETTE.bubblegum },
  { kind: "dot", color: PALETTE.lavender },
  { kind: "star", color: PALETTE.lavender },
  { kind: "donut", color: PALETTE.butter },
  { kind: "gem", color: PALETTE.butter },
  { kind: "dot", color: PALETTE.bubblegum },
];

/** Playful floating 'stickers' (stars, donuts, pills) that bop on the beat. */
export function Stickers() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const geos = useMemo(
    () => ({
      star: new THREE.ExtrudeGeometry(starShape(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }),
      donut: new THREE.TorusGeometry(0.2, 0.085, 16, 40),
      gem: new THREE.OctahedronGeometry(0.2, 0),
      dot: new THREE.SphereGeometry(0.13, 24, 16),
    }),
    [],
  );
  const orbits = useMemo(
    () =>
      KINDS.map((_, i) => ({
        r: 5.2 + (i % 3) * 0.9 + Math.random() * 0.6,
        phase: (i / KINDS.length) * Math.PI * 2,
        y: (Math.random() - 0.5) * 3.2,
        speed: 0.6 + Math.random() * 0.6,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.4),
      })),
    [],
  );

  useFrame((_, dt) => {
    const t = features.time;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const o = orbits[i];
      const a = o.phase + t * 0.08 * o.speed;
      m.position.set(Math.cos(a) * o.r, o.y + Math.sin(t * 0.7 + i) * 0.25, Math.sin(a) * o.r * 0.45 - 0.8);
      m.rotation.x += dt * o.spin.x * (0.4 + features.energy);
      m.rotation.y += dt * o.spin.y * (0.4 + features.energy);
      // bop: alternate stickers pop on alternating beats
      const onBeat = Math.floor(features.step / 4) % 2 === i % 2;
      m.scale.setScalar(1 + (onBeat ? features.kick * 0.35 : 0));
    });
  });

  return (
    <>
      {KINDS.map((k, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={geos[k.kind]}>
          <meshBasicMaterial color={k.color} />
        </mesh>
      ))}
    </>
  );
}
