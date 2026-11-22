import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { features, LIGHT_BLENDING, PALETTE } from "./features";

const RIBBONS = [
  { y: 0.6, z: -5.5, width: 1.6, tilt: 0.18, speed: 1, phase: 0, a: PALETTE.lavender, b: PALETTE.bubblegum },
  { y: -0.4, z: -6.5, width: 2.2, tilt: -0.12, speed: -0.7, phase: 2.1, a: PALETTE.bubblegum, b: PALETTE.butter },
  { y: 1.5, z: -7.5, width: 2.8, tilt: 0.06, speed: 0.5, phase: 4.2, a: PALETTE.grape, b: PALETTE.lavender },
] as const;
const LENGTH = 34;

/**
 * Silky light ribbons drifting behind the blob, in place of the club lasers:
 * they undulate with the bass, shimmer with the hats, twist tighter through a
 * build-up and flare on the drop. Wide, soft and curved, so they add depth
 * without slicing the frame with hard lines.
 */
export function Ribbons() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(LENGTH, 1, 220, 24), []);
  const materials = useMemo(
    () =>
      RIBBONS.map(
        (r) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uTime: { value: 0 },
              uWidth: { value: r.width },
              uPhase: { value: r.phase },
              uSpeed: { value: r.speed },
              uBass: { value: 0 },
              uKick: { value: 0 },
              uHigh: { value: 0 },
              uBuild: { value: 0 },
              uDrop: { value: 0 },
              uCalm: { value: 0 },
              uEnergy: { value: 0.3 },
              uA: { value: new THREE.Color(r.a) },
              uB: { value: new THREE.Color(r.b) },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            ...LIGHT_BLENDING,
            vertexShader: /* glsl */ `
              uniform float uTime, uWidth, uPhase, uSpeed, uBass, uBuild, uDrop, uCalm;
              varying vec2 vUv;
              varying float vFacing;
              void main(){
                vUv = uv;
                float x = position.x;
                float t = uTime * 0.35 * uSpeed + uPhase;
                // a slow travelling wave along the ribbon, taller with the bass
                float amp = 0.9 + 0.9 * uBass + 1.2 * uDrop - 0.4 * uCalm;
                float y = sin(x * 0.22 + t) * amp + sin(x * 0.53 - t * 1.3) * 0.35 * amp;
                // the ribbon twists around its own axis; a build-up winds it tighter
                float twist = x * (0.12 + 0.25 * uBuild * uBuild) + t * 0.8;
                float w = position.y * uWidth * (1.0 + 0.35 * uDrop);
                vec3 p = vec3(x, y + cos(twist) * w, sin(twist) * w + sin(x * 0.17 + t) * 1.2);
                vFacing = abs(cos(twist)); // how flat-on the silk is to us: edge-on folds read brighter
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
              }`,
            fragmentShader: /* glsl */ `
              uniform float uTime, uKick, uHigh, uDrop, uCalm, uEnergy;
              uniform vec3 uA, uB;
              varying vec2 vUv;
              varying float vFacing;
              void main(){
                float across = abs(vUv.y - 0.5) * 2.0;                 // 0 centre .. 1 edge
                float soft = 1.0 - smoothstep(0.35, 1.0, across);      // feathered edges
                float ends = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
                // fine silk threads running along the ribbon, glinting with the hats
                float threads = 0.75 + 0.25 * sin(vUv.y * 90.0 + sin(vUv.x * 30.0) * 2.0);
                float glint = pow(max(0.0, sin(vUv.x * 40.0 - uTime * 3.0)), 24.0) * uHigh;
                vec3 col = mix(uA, uB, 0.5 + 0.5 * sin(vUv.x * 6.0 + uTime * 0.4));
                float fold = 1.0 + 1.6 * pow(1.0 - vFacing, 3.0);     // bright creases where it turns
                float a = soft * ends * threads * fold * (0.06 + 0.07 * uEnergy + 0.08 * uKick + 0.25 * uDrop) * (1.0 - 0.3 * uCalm);
                gl_FragColor = vec4(col * a + vec3(1.0, 0.95, 0.85) * glint * soft * ends * 0.4, 0.0); // premultiplied light
              }`,
          }),
      ),
    [],
  );

  useFrame(() => {
    const f = features;
    materials.forEach((m) => {
      const u = m.uniforms;
      u.uTime.value = f.time;
      u.uBass.value = f.bass;
      u.uKick.value = f.kick;
      u.uHigh.value = f.high;
      u.uBuild.value = f.build;
      u.uDrop.value = f.drop;
      u.uCalm.value = f.calm;
      u.uEnergy.value = f.energy;
    });
  });

  return (
    <>
      {RIBBONS.map((r, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={materials[i]}
          position={[0, r.y, r.z]}
          rotation={[0, 0, r.tilt]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}
