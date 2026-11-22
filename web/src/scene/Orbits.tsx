import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, LIGHT_BLENDING, PALETTE } from "./features";

/**
 * Energy-ring shader for thin tori: a soft glowing tube whose colour drifts
 * between two tints, with fine dashes flowing along it and a few bright comets
 * (with fading tails) racing around. `uHead` >= 0 pins one comet to a position
 * around the ring (0..1), e.g. the sequencer playhead; -1 lets them run free.
 */
export function energyRingMaterial(a: string, b: string, comets = 3, dashes = 64) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.5 },
      uSpeed: { value: 1 },
      uKick: { value: 0 },
      uHigh: { value: 0 },
      uDrop: { value: 0 },
      uHead: { value: -1 },
      uA: { value: new THREE.Color(a) },
      uB: { value: new THREE.Color(b) },
    },
    transparent: true,
    depthWrite: false,
    ...LIGHT_BLENDING,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vEdge;
      void main(){
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vEdge = abs(dot(n, normalize(-mv.xyz)));   // 1 facing us (tube centre), 0 at the silhouette
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uSpeed, uKick, uHigh, uDrop, uHead;
      uniform vec3 uA, uB;
      varying vec2 vUv;
      varying float vEdge;
      void main(){
        float u = vUv.x;
        float t = uTime * uSpeed;
        // a glowing core that fades to the tube's edges, so it reads as light, not plastic
        // (no pow() here: on some GPUs pow(0, y) gives NaN at the silhouette, and bloom spreads
        //  NaN pixels across the whole frame -- a black screen)
        float e = clamp(vEdge, 0.0, 1.0);
        float core = e * sqrt(e);
        // fine dashes streaming along the ring, sharper with the hats
        float dash = smoothstep(0.25, 0.5, abs(fract(u * ${dashes}.0 - t * 0.6) - 0.5) * 2.0);
        // comets: bright heads with long fading tails
        float comet = 0.0;
        for (int k = 0; k < ${comets}; k++) {
          float head = uHead >= 0.0 && k == 0 ? uHead : fract(t * 0.08 + float(k) / ${comets}.0);
          float h = clamp(1.0 - fract(head - u), 1e-4, 1.0); // 1 at the head, falling behind it
          comet += pow(h, 14.0) + pow(h, 120.0) * 2.0;
        }
        vec3 col = mix(uA, uB, 0.5 + 0.5 * sin(u * 6.2831853 * 2.0 + uTime * 0.3));
        float a = (0.35 + 0.35 * dash * (0.6 + uHigh) + comet * (1.0 + uKick) + uDrop) * core * uOpacity;
        vec3 hot = mix(col, vec3(1.0, 0.95, 0.8), clamp(comet * 0.35, 0.0, 0.8)); // comet heads burn white-gold
        gl_FragColor = vec4(hot * a, 0.0); // premultiplied light
      }`,
  });
}

const RINGS = [
  { r: 3.25, tilt: [1.25, 0.2, 0], a: PALETTE.lavender, b: PALETTE.bubblegum, speed: 1, opacity: 0.8 },
  { r: 3.9, tilt: [1.05, -0.5, 0.3], a: PALETTE.bubblegum, b: PALETTE.butter, speed: -0.5, opacity: 0.6 },
  { r: 4.6, tilt: [1.6, 0.6, -0.2], a: PALETTE.grape, b: PALETTE.lavender, speed: 0.25, opacity: 0.8 },
] as const;

/**
 * Thin orbit rings spinning in time with the BPM (ring 1 = one turn every 4 bars).
 * A build-up folds them flat into one plane, like a machine locking into place;
 * the drop throws them back open.
 */
export function Orbits() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const materials = useMemo(() => RINGS.map((r) => energyRingMaterial(r.a, r.b, 3, 90)), []);
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
      const u = materials[i].uniforms;
      u.uOpacity.value = Math.min(1.2, ring.opacity * (0.6 + f.energy * 0.6) + fold * 0.3 + f.drop * 0.6) * (1 - f.calm * 0.45);
      u.uTime.value = f.time;
      u.uSpeed.value = ring.speed * (1 + fold * 2 + f.drop * 2);
      u.uKick.value = f.kick;
      u.uHigh.value = f.high;
      u.uDrop.value = f.drop * 0.5;
    });
  });
  return (
    <>
      {RINGS.map((ring, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} rotation={ring.tilt as unknown as THREE.Euler} material={materials[i]}>
          <torusGeometry args={[ring.r, 0.022, 12, 360]} />
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
