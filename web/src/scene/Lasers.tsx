import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, LIGHT_BLENDING, PALETTE } from "./features";

const BEAMS = 10;
const LENGTH = 28;
const COLORS = [PALETTE.lavender, PALETTE.bubblegum, PALETTE.butter, PALETTE.bubblegum, PALETTE.lavender];
const TAU = Math.PI * 2;

/**
 * Club lasers behind the blob. They only fire when the music is hot (peak,
 * build-ups, drops), sweep in time with the beat, and switch choreography on
 * every new phrase -- so the light show follows the structure of the track.
 */
export function Lasers() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const angles = useRef(new Float32Array(BEAMS));
  const { geometry, materials } = useMemo(() => {
    // a long thin cone with its base at the origin, so rotating it sweeps the beam
    const g = new THREE.CylinderGeometry(0.012, 0.06, LENGTH, 8, 1, true).translate(0, LENGTH / 2, 0);
    const mats = Array.from(
      { length: BEAMS },
      (_, i) =>
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(COLORS[i % COLORS.length]) }, uOpacity: { value: 0 } },
          transparent: true,
          depthWrite: false,
          ...LIGHT_BLENDING,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `
            varying float vAlong;
            void main(){
              vAlong = uv.y;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying float vAlong;
            void main(){
              // bright at the source, fading out into the haze
              float a = pow(1.0 - vAlong, 1.6) * uOpacity;
              gl_FragColor = vec4(uColor * (1.4 + 0.6 * (1.0 - vAlong)) * a, 0.0); // premultiplied light
            }`,
        }),
    );
    return { geometry: g, materials: mats };
  }, []);

  useFrame((_, dt) => {
    const f = features;
    // how much light show the music asks for
    const hot = THREE.MathUtils.smoothstep(f.mood, 0.75, 1) * (1 - f.calm);
    const vis = Math.min(1, hot * (0.4 + f.energy * 0.6) + f.build * f.build * 0.55 + f.drop);
    const wave = Math.sin((TAU * f.beat) / 4); // one sweep per bar, seamless across bars
    const beatOn = Math.floor(f.beat) % 2;
    const pattern = f.phrase % 4;

    refs.current.forEach((m, i) => {
      if (!m) return;
      const spread = (i / (BEAMS - 1)) * 2 - 1; // -1 .. 1 across the stage
      const side = i % 2 ? 1 : -1;
      let target: number;
      if (pattern === 0) target = spread * 0.75 + wave * 0.35; // fan, swaying together
      else if (pattern === 1) target = side * (0.15 + 0.5 * (0.5 + 0.5 * wave)) + spread * 0.2; // scissors
      else if (pattern === 2) target = Math.sin((TAU * f.beat) / 4 + spread * 1.4) * 0.7; // a wave rolling across
      else target = spread * (beatOn ? 0.85 : -0.85); // snap across on every beat
      // a build-up pulls every beam to vertical, like a spotlight on the blob
      target *= 1 - f.build * f.build * 0.85;
      angles.current[i] += (target - angles.current[i]) * (1 - Math.exp(-dt * 10));

      m.rotation.set(0.3, 0, angles.current[i]); // leaning out over the viewer
      // halves of the rig alternate on the beat; kicks punch the brightness
      const alt = i % 2 === beatOn ? 1 : 0.5;
      materials[i].uniforms.uOpacity.value = vis * alt * (0.35 + 0.65 * f.kick + 0.4 * f.drop) * 0.6;
      m.visible = vis > 0.01;
    });
  });

  return (
    <group position={[0, -2.4, -6]}>
      {materials.map((mat, i) => (
        <mesh
          key={i}
          ref={(m) => void (refs.current[i] = m)}
          geometry={geometry}
          material={mat}
          position={[((i / (BEAMS - 1)) * 2 - 1) * 6.5, 0, 0]}
          visible={false}
        />
      ))}
    </group>
  );
}
