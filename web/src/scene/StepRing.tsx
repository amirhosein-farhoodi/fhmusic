import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";
import { energyRingMaterial } from "./Orbits";

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
  // the track: an energy ring whose brightest comet rides the playhead
  const track = useMemo(() => energyRingMaterial(PALETTE.lavender, PALETTE.bubblegum, 2, 64), []);
  // candy pills: glossy clearcoat + sheen, and they glow in their own (instance) colour
  const pill = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      sheen: 0.5,
      sheenColor: new THREE.Color(PALETTE.bubblegum),
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 0.45,
    });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = emissive * vColor.rgb; // glow in the step's colour",
      );
    };
    return m;
  }, []);
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
      // a build-up stretches the trail behind the playhead; the drop lights every step at once
      const trail = 0.9 - features.build * 0.55;
      const glow = features.playing ? Math.max(Math.exp(-behind * trail), features.drop * 0.9) : 0;
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
    const u = track.uniforms;
    u.uTime.value = features.time;
    u.uKick.value = features.kick;
    u.uHigh.value = features.high;
    u.uDrop.value = features.drop * 0.6;
    u.uOpacity.value = 0.55 + features.energy * 0.3 + features.build * 0.3;
    // pin the head comet to the playhead (the ring's uv runs the same way as the steps)
    u.uHead.value = features.playing ? (head / STEPS) % 1 : -1;
    group.current!.rotation.y += dt * (0.08 + features.build * features.build * 0.6 + features.drop * 0.5);
  });

  return (
    <group ref={group} rotation={[0.42, 0, 0.08]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={track}>
        <torusGeometry args={[RADIUS, 0.024, 12, 256]} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, pill, STEPS]}>
        <capsuleGeometry args={[0.1, 0.34, 12, 24]} />
      </instancedMesh>
    </group>
  );
}
