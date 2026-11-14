import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const STEPS = 16;
const RADIUS = 2.75;

/**
 * A 16-step sequencer ring around the blob: the light chases the real
 * 16th-note position of the music; downbeats are pink, the playhead is butter yellow.
 */
export function StepRing() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(
    () => ({
      grape: new THREE.Color(PALETTE.lavender),
      pink: new THREE.Color(PALETTE.bubblegum),
      butter: new THREE.Color(PALETTE.butter),
      tmp: new THREE.Color(),
    }),
    [],
  );

  useLayoutEffect(() => {
    const m = mesh.current!;
    for (let i = 0; i < STEPS; i++) m.setColorAt(i, c.grape);
    m.instanceColor!.needsUpdate = true;
  }, [c]);

  useFrame((_, dt) => {
    const m = mesh.current!;
    const head = features.step;
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      // distance behind the playhead, in steps (0 = lit now)
      const behind = (head - i + STEPS) % STEPS;
      const glow = features.playing ? Math.exp(-behind * 0.9) : 0;
      const down = i % 4 === 0;
      const base = down ? c.pink : c.grape;
      c.tmp.copy(base).multiplyScalar(down ? 0.9 : 0.75);
      c.tmp.lerp(c.butter, Math.min(1, glow)).multiplyScalar(1 + glow * 0.9);
      m.setColorAt(i, c.tmp);

      const s = 1 + glow * 0.6 + (down ? features.kick * 0.25 : 0);
      dummy.position.set(Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS);
      dummy.rotation.set(0, -a, Math.PI / 2);
      dummy.scale.set(s, 1 + glow * 0.6, s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.needsUpdate = true;
    group.current!.rotation.y += dt * 0.08;
  });

  return (
    <group ref={group} rotation={[0.42, 0, 0.08]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS, 0.018, 8, 200]} />
        <meshBasicMaterial color={PALETTE.lavender} transparent opacity={0.45} toneMapped={false} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, STEPS]}>
        <capsuleGeometry args={[0.1, 0.34, 6, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
