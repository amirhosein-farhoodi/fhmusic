import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { BloomEffect } from "postprocessing";
import { useRef } from "react";
import { useDJ } from "../store";
import { DJ_PANEL_FRACTION, DJ_PANEL_MAX_PX } from "../ui/DJPanel";
import { AudioDriver } from "./AudioDriver";
import { features } from "./features";
import { KickRipples, Orbits } from "./Orbits";
import { Particles } from "./Particles";
import { SodaBlob } from "./SodaBlob";
import { StepRing } from "./StepRing";
import { Stickers } from "./Stickers";

function CameraRig() {
  const shift = useRef(0);
  useFrame(({ camera, size }, dt) => {
    const t = features.time;
    const punch = features.kick * 0.22;
    // portrait screens: step back and lift the scene above the control cards
    const aspect = size.width / size.height;
    const portrait = Math.max(0, 1 - aspect);
    const dist = 8.2 + portrait * 13;
    // DJ panel open on desktop: slide the scene so the blob sits in the visible half
    let target = 0;
    if (useDJ.getState().djOpen && size.width >= 1024) {
      const panel = Math.min(DJ_PANEL_FRACTION, DJ_PANEL_MAX_PX / size.width);
      const halfWidth = Math.tan(((42 / 2) * Math.PI) / 180) * dist * aspect;
      target = panel * halfWidth;
    }
    shift.current += (target - shift.current) * (1 - Math.exp(-dt * 5));
    const x = shift.current;
    camera.position.set(x + Math.sin(t * 0.11) * 1.1, 1.0 + Math.sin(t * 0.07) * 0.4, dist - punch);
    camera.lookAt(x, -0.1 - portrait * 5.2, 0);
  });
  return null;
}

function Effects() {
  const bloom = useRef<BloomEffect>(null);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 0.55 + features.energy * 0.6 + features.kick * 0.35;
  });
  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.32} luminanceSmoothing={0.3} radius={0.75} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}

export function Scene() {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      camera={{ fov: 42, position: [0, 1, 8.2] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <AudioDriver />
      <CameraRig />
      <fog attach="fog" args={["#1d1220", 9, 22]} />
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
