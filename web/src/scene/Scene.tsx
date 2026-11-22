import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { BloomEffect, ChromaticAberrationEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useDJ } from "../store";
import { DJ_PANEL_FRACTION, DJ_PANEL_MAX_PX } from "../ui/DJPanel";
import { AudioDriver } from "./AudioDriver";
import { Backdrop } from "./Backdrop";
import { features } from "./features";
import { Lasers } from "./Lasers";
import { KickRipples, Orbits } from "./Orbits";
import { Particles } from "./Particles";
import { SodaBlob } from "./SodaBlob";
import { StepRing } from "./StepRing";
import { Stickers } from "./Stickers";

const FOV = 42;

// Camera angles the "director" cuts between, one per phrase: azimuth and
// elevation (radians) and a distance offset. The first one is the home shot.
const SHOTS = [
  { az: 0, el: 0, d: 0 },
  { az: 0.5, el: 0.12, d: -0.8 },
  { az: -0.45, el: -0.08, d: 0.2 },
  { az: 0.2, el: 0.32, d: -1.4 },
  { az: -0.25, el: 0.05, d: 0.9 },
  { az: 0.6, el: -0.1, d: 0.4 },
];

const ease = (cur: number, target: number, dt: number, rate: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/**
 * A camera that follows the music like a VJ: it changes angle on each new phrase,
 * creeps in and shudders through a build-up, kicks back with a wide lens on the
 * drop, floats in breakdowns, and re-frames the stage when the UI is hidden.
 */
function CameraRig() {
  const s = useRef({ shift: 0, az: 0, el: 0, d: 0, roll: 0, fov: FOV, dropSide: 1, lastDrop: 0, clean: 0 });
  useFrame(({ camera, size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = s.current;
    const f = features;
    const m = f.motion;
    const t = f.time;
    const now = clock.elapsedTime;
    const { djOpen, clean } = useDJ.getState();

    st.clean = ease(st.clean, clean ? 1 : 0, dt, 2.5);
    f.clean = st.clean;

    // portrait screens: step back and lift the scene above the control cards (not needed without UI)
    const aspect = size.width / size.height;
    const portrait = Math.max(0, 1 - aspect);
    const base = (8.2 + portrait * 13) * (1 - st.clean * 0.06);

    // phrase-by-phrase camera angles while the music plays; home shot otherwise and in breakdowns
    // (the DJ panel keeps the home shot: a DJ needs a steady view)
    const shot = f.playing && f.calm < 0.5 && !djOpen ? SHOTS[f.phrase % SHOTS.length] : SHOTS[0];
    const glide = 0.9 + f.mood * 0.8; // hotter music, snappier moves
    st.az = ease(st.az, shot.az * m, dt, glide);
    st.el = ease(st.el, shot.el * m, dt, glide);
    st.d = ease(st.d, shot.d * m, dt, glide);

    // the drop: kick back + wide lens + a roll that alternates sides
    if (f.drop > 0.95 && st.lastDrop <= 0.95) st.dropSide *= -1;
    st.lastDrop = f.drop;
    const build2 = f.build * f.build;
    const rollTarget = (f.drop * 0.09 * st.dropSide + build2 * 0.04 * Math.sin(now * 0.9)) * m;
    st.roll = ease(st.roll, rollTarget, dt, 6);
    st.fov = ease(st.fov, FOV + (f.drop * 9 - build2 * 4) * m, dt, 8);

    const punch = f.kick * 0.22 * (1 - f.calm * 0.8) * m;
    const dist = base * (1 - build2 * 0.16 + f.calm * 0.06) + st.d + f.drop * 1.2 * m - punch;

    // DJ panel open on desktop: slide the scene so the blob sits in the visible half
    let target = 0;
    if (djOpen && size.width >= 1024) {
      const panel = Math.min(DJ_PANEL_FRACTION, DJ_PANEL_MAX_PX / size.width);
      const halfWidth = Math.tan(((FOV / 2) * Math.PI) / 180) * dist * aspect;
      target = panel * halfWidth;
    }
    st.shift = ease(st.shift, target, dt, 5);

    // build-up shudder, snare/kick jolts at the peak
    const shake = (build2 * 0.06 + (f.snare * 0.02 + f.kick * 0.015) * f.mood) * m;
    const jx = Math.sin(now * 37.3) * shake;
    const jy = Math.sin(now * 29.1 + 1.3) * shake;

    const az = st.az + Math.sin(t * 0.11) * 0.13 * (1 - f.calm * 0.4);
    const el = st.el + Math.sin(t * 0.07) * 0.05;
    const lookY = -0.1 - portrait * 5.2 * (1 - st.clean);
    camera.position.set(
      st.shift + Math.sin(az) * dist + jx,
      1.0 + Math.tan(el) * dist + jy,
      Math.cos(az) * dist,
    );
    camera.up.set(Math.sin(st.roll), Math.cos(st.roll), 0);
    camera.lookAt(st.shift, lookY, 0);
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - st.fov) > 0.01) {
      cam.fov = st.fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function Effects() {
  const bloom = useRef<BloomEffect>(null);
  const chroma = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0, 0), []);
  useFrame(() => {
    const f = features;
    if (bloom.current) {
      bloom.current.intensity =
        0.55 + f.energy * 0.6 + f.kick * 0.35 + f.build * f.build * 0.45 + f.drop * 1.1 - f.calm * 0.1;
    }
    if (chroma.current) {
      // colour fringing at the edges of the frame on hard hits, big on the drop
      const v = (f.kick * f.mood * 0.0016 + f.snare * f.mood * 0.001 + f.build * f.build * 0.0015 + f.drop * 0.0065) * f.motion;
      chroma.current.offset.set(v, v * 0.6);
    }
  });
  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.32} luminanceSmoothing={0.3} radius={0.75} />
      <ChromaticAberration ref={chroma} offset={offset} radialModulation modulationOffset={0.25} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}

export function Scene() {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      camera={{ fov: FOV, position: [0, 1, 8.2] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <AudioDriver />
      <CameraRig />
      <fog attach="fog" args={["#1d1220", 9, 22]} />
      <Backdrop />
      <Lasers />
      <SodaBlob />
      <StepRing />
      <Orbits />
      <KickRipples />
      <Particles />
      <Stickers />
      <Effects />
    </Canvas>
  );
}
