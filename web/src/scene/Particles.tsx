import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

const COUNT = 1800;

/** A slowly swirling cloud of soda bubbles that sparkles with the hi-hats. */
export function Particles() {
  const points = useRef<THREE.Points>(null);
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
    return { geometry: g, uniforms: { uTime: { value: 0 }, uHigh: { value: 0 }, uKick: { value: 0 } } };
  }, []);

  useFrame((_, dt) => {
    uniforms.uTime.value = features.time;
    uniforms.uHigh.value = features.high;
    uniforms.uKick.value = features.kick;
    points.current!.rotation.y += dt * (0.02 + features.energy * 0.06);
  });

  return (
    <points ref={points} geometry={geometry}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          uniform float uTime, uHigh, uKick;
          attribute float seed;
          varying vec3 vColor;
          varying float vTw;
          void main(){
            vColor = color;
            vec3 p = position;
            p.y += sin(uTime * 0.6 + seed * 40.0) * 0.25;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float tw = 0.55 + 0.45 * sin(uTime * 3.0 + seed * 90.0);
            vTw = tw * (0.5 + uHigh * 1.2);
            gl_PointSize = (2.0 + seed * 5.0) * (1.0 + uKick * 0.6) * (60.0 / -mv.z);
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
