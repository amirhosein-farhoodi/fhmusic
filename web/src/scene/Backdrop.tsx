import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const BARS = features.spectrum.length;
// Far bigger than the view from any camera angle, zoom or screen shape, so its
// edge is never seen: it is the dark "room" the whole scene sits in.
const W = 400;
const H = 240;

/**
 * The room behind the stage: a glow that takes the colour of the section
 * (cool in breakdowns, hot at the peak, white flash on the drop) and an LED
 * "skyline" of the live spectrum, bass in the middle, mirrored on the floor.
 */
export function Backdrop() {
  const uniforms = useMemo(
    () => ({
      uSpec: { value: features.spectrum },
      uMood: { value: 0.4 },
      uEnergy: { value: 0.3 },
      uKick: { value: 0 },
      uDrop: { value: 0 },
      uCalm: { value: 0 },
      uGrape: { value: new THREE.Color(PALETTE.grape) },
      uLavender: { value: new THREE.Color(PALETTE.lavender) },
      uPink: { value: new THREE.Color(PALETTE.bubblegum) },
      uButter: { value: new THREE.Color(PALETTE.butter) },
    }),
    [],
  );

  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    const f = features;
    // R3F gives the material its own copy of `uniforms`, so write to the live material's set
    const u = (mat.current?.uniforms ?? uniforms) as typeof uniforms;
    u.uMood.value = f.mood;
    u.uEnergy.value = f.energy;
    u.uKick.value = f.kick;
    u.uDrop.value = f.drop;
    u.uCalm.value = f.calm;
  });

  return (
    <mesh position={[0, 2, -16]} renderOrder={-1}>
      <planeGeometry args={[W, H]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        depthWrite={false}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={/* glsl */ `
          uniform float uSpec[${BARS}];
          uniform float uMood, uEnergy, uKick, uDrop, uCalm;
          uniform vec3 uGrape, uLavender, uPink, uButter;
          varying vec2 vUv;
          void main(){
            // world position on the plane (centred 2 above the origin); the floor is at y = -1.75
            vec2 w = vec2((vUv.x - 0.5) * ${W}.0, (vUv.y - 0.5) * ${H}.0 + 2.0);

            // ---- section glow, centred behind the blob
            float r = length(w * vec2(0.6, 1.0)) / 18.0;
            vec3 tint = mix(uLavender * 0.6, mix(uGrape, uPink, 0.45), uMood);
            float glow = exp(-r * r * 2.5) * (0.12 + 0.22 * uEnergy + 0.12 * uKick * uMood);
            vec3 col = tint * glow + uButter * exp(-r * r * 1.5) * uDrop * 0.55;

            // ---- spectrum skyline: bars mirrored from the centre (bass) outwards, low behind the stage
            float span = 24.0;                                  // half-width of the wall
            float x = abs(w.x) / span;
            if (x < 1.0) {
              float fi = x * float(${BARS});
              int i = int(fi);
              float cell = fract(fi);
              float h = uSpec[i] * (2.0 + 3.5 * uEnergy) * (1.0 - 0.6 * uCalm);
              float y = w.y + 1.75;                             // height above the floor
              float inBar = smoothstep(0.1, 0.2, cell) * smoothstep(0.9, 0.8, cell);
              // LED segments: horizontal slits make it read as a club wall, not a chart
              float seg = smoothstep(0.2, 0.4, fract(abs(y) * 2.5));
              float up = step(0.0, y) * step(y, h) * (1.0 - 0.6 * y / max(h, 0.01)); // brightest at the floor
              float down = step(-h * 0.5, y) * step(y, 0.0) * 0.2;                   // reflection on the floor
              float cap = smoothstep(h - 0.35, h, y) * step(y, h) * step(0.05, h);  // a lit cap on each bar
              vec3 c = mix(uLavender, uPink, clamp(y / 5.0, 0.0, 1.0));
              float fade = 1.0 - smoothstep(0.45, 1.0, x);                           // edges melt into the dark
              col += (c * (up + down) * seg + uButter * cap * 0.8) * inBar * fade * (0.07 + 0.07 * uMood);
            }

            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  );
}
