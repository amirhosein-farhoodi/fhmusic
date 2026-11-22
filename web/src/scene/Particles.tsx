import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const COUNT = 1800;

/**
 * A slowly swirling cloud of soda bubbles that sparkles with the hi-hats.
 * A build-up sucks it in towards the blob, the drop blasts it back out.
 */
export function Particles() {
  const points = useRef<THREE.Points>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    const palette = [PALETTE.lavender, PALETTE.bubblegum, PALETTE.butter, PALETTE.grape, PALETTE.lavender].map(
      (h) => new THREE.Color(h),
    );
    for (let i = 0; i < COUNT; i++) {
      const r = 5 + Math.pow(Math.random(), 0.7) * 9;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th)], i * 3);
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    return { geometry: g, uniforms: { uTime: { value: 0 }, uHigh: { value: 0 }, uKick: { value: 0 }, uHat: { value: 0 }, uBuild: { value: 0 }, uDrop: { value: 0 }, uCalm: { value: 0 } } };
  }, []);

  useFrame((_, dt) => {
    const f = features;
    // R3F gives the material its own copy of `uniforms`, so write to the live material's set
    const u = (mat.current?.uniforms ?? uniforms) as typeof uniforms;
    u.uTime.value = f.time;
    u.uHigh.value = f.high;
    u.uKick.value = f.kick;
    u.uHat.value = f.hat;
    u.uBuild.value = f.build;
    u.uDrop.value = f.drop;
    u.uCalm.value = f.calm;
    points.current!.rotation.y += dt * (0.02 + f.energy * 0.06 + f.build * f.build * 0.5 + f.drop * 0.4 - f.calm * 0.015);
  });

  return (
    <points ref={points} geometry={geometry}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          uniform float uTime, uHigh, uKick, uHat, uBuild, uDrop, uCalm;
          attribute float seed;
          varying vec3 vColor;
          varying float vTw;
          void main(){
            vColor = color;
            vec3 p = position;
            // breakdowns: bubbles drift up slowly, like a fizzy drink settling
            p.y += sin(uTime * 0.6 + seed * 40.0) * (0.25 + 0.35 * uCalm);
            // build-up: pulled in towards the centre (inner ones first); drop: blasted out
            float pull = uBuild * uBuild * (0.35 + 0.25 * seed);
            p *= 1.0 - pull + uDrop * (0.35 + 0.5 * seed);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float tw = 0.55 + 0.45 * sin(uTime * 3.0 + seed * 90.0);
            // a random third of the bubbles flash on every hi-hat
            float hatFlash = step(0.66, fract(seed * 7.13 + floor(uTime * 2.0) * 0.37)) * uHat;
            vTw = tw * (0.5 + uHigh * 1.2) + hatFlash * 1.2 + uDrop * 0.8 + uBuild * 0.4;
            gl_PointSize = (2.0 + seed * 5.0) * (1.0 + uKick * 0.6 + uDrop * 0.8) * (60.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={/* glsl */ `
          varying vec3 vColor;
          varying float vTw;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor * (0.6 + vTw), a * (0.35 + vTw * 0.6));
          }`}
        vertexColors
      />
    </points>
  );
}
