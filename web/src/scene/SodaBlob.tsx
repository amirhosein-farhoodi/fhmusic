import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useDJ } from "../store";
import { features, PALETTE } from "./features";

// 3D simplex noise -- Ashima Arts / Stefan Gustavson (MIT)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ---- Starburst (experimental shape, toggle with S): spikes on a Fibonacci sphere
const SPIKES = 42;
const SPIKE_WIDTH = 0.42; // angular radius of a spike's base (spikes are ~0.55 rad apart)
const SPIKE_DIRS = Array.from({ length: SPIKES }, (_, i) => {
  const y = 1 - ((i + 0.5) / SPIKES) * 2;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5)); // golden angle
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});
// each spike listens to its own slice of the spectrum (shuffled, so neighbours differ)
// and has its own length, so the burst looks hand-made rather than a perfect mace
const SPIKE_BAND = SPIKE_DIRS.map((_, i) => (i * 11) % features.spectrum.length);
const SPIKE_SIZE = SPIKE_DIRS.map((_, i) => 0.7 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));

const vertexShader = /* glsl */ `
uniform float uTime, uBass, uKick, uEnergy, uHigh, uSnare, uBuild, uDrop, uCalm, uBeatPulse, uSpiky;
uniform vec3 uDirs[${SPIKES}];
uniform float uLen[${SPIKES}];
varying float vDisp;
varying float vTip;
varying vec3 vPos;
${NOISE}
void main(){
  // big, slow lobes (bass); a build-up tightens them and makes them busier
  float slow = snoise(normal * (1.1 + uBuild * 1.3) + vec3(0.0, uTime * 0.3, uTime * 0.18));
  // a little surface shimmer (hats), nervous during a build-up
  float fine = snoise(normal * 3.2 + uTime * 0.8);
  // sharp spikes that stab out on snares and claps, and erupt on the drop
  float spikes = max(0.0, snoise(normal * 6.5 + uTime * 1.7));
  spikes *= spikes;
  float calm = 1.0 - 0.55 * uCalm; // breakdowns: smooth and floating
  float d = slow * (0.14 + 0.38 * uBass + 0.16 * uEnergy + 0.35 * uDrop) * calm
          + fine * (0.025 * (1.0 + 2.0 * uHigh) + 0.06 * uBuild)
          + spikes * (0.28 * uSnare + 0.55 * uDrop) * calm;
  // kick punch; the build-up compresses it, the drop releases it, breakdowns breathe on the beat
  float scale = 1.0 + 0.08 * uKick * (1.0 - 0.7 * uCalm) - 0.12 * uBuild * uBuild + 0.2 * uDrop + 0.04 * uBeatPulse * uCalm;

  // starburst: concave cones around each spike direction, the tallest one wins
  float spiky = clamp(uSpiky, 0.0, 1.2);
  float tip = 0.0;
  if (spiky > 0.001) {
    float star = 0.0;
    for (int i = 0; i < ${SPIKES}; i++) {
      float ang = acos(clamp(dot(normal, uDirs[i]), -1.0, 1.0));
      float s = clamp(1.0 - ang / ${SPIKE_WIDTH}, 0.0, 1.0);
      float cone = mix(s * s, smoothstep(0.0, 1.0, s) * 0.55, uCalm); // breakdowns round the points off
      float h = cone * uLen[i];
      if (h > star) { star = h; tip = s; }
    }
    star += slow * 0.05 + fine * 0.02 * (1.0 + 2.0 * uHigh);
    d = mix(d, star, spiky);
    scale *= mix(1.0, 0.7, spiky); // smaller core, so the points carry the size
  }
  vDisp = d;
  vTip = tip * min(spiky, 1.0);
  vec3 p = (position + normal * d) * scale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

// Glossy 'soda candy' shading: real lighting from the displaced surface,
// a sharp specular highlight, a pink rim and swirl bands that follow the
// shape, so the blob reads as a solid 3D object instead of a purple cloud.
// The music colours it: heat rising through a build-up, a white-hot flash on
// the drop and a glassy, iridescent soap-bubble look in breakdowns.
const fragmentShader = /* glsl */ `
uniform vec3 uGrape, uLavender, uPink, uButter, uPlum;
uniform float uKick, uEnergy, uTime, uSnare, uBuild, uDrop, uCalm;
varying float vDisp;
varying float vTip;
varying vec3 vPos;
void main(){
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));   // true normal of the wobbling surface
  vec3 v = normalize(-vPos);
  vec3 key = normalize(vec3(-0.55, 0.75, 0.55));
  vec3 fill = normalize(vec3(0.7, -0.3, 0.4));

  float diff = max(dot(n, key), 0.0);
  float back = max(dot(n, fill), 0.0);
  float spec = pow(max(dot(reflect(-key, n), v), 0.0), 48.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);

  // body: deep grape in the valleys, lavender on the lobes
  vec3 body = mix(uGrape * 0.75, uLavender, smoothstep(-0.25, 0.3, vDisp));
  // candy swirl bands drifting over the surface; they race during a build-up
  float band = smoothstep(0.55, 0.75, sin(vDisp * 22.0 - uTime * (1.6 + 5.0 * uBuild)) * 0.5 + 0.5);
  body = mix(body, uPink, band * (0.35 + 0.35 * uBuild));

  vec3 col = uPlum * 0.6 + body * (0.35 + 0.85 * diff) + uPink * back * 0.25;
  col += uPink * fres * (0.9 + 0.8 * uSnare);                        // rim light, flares on snares
  col += mix(vec3(1.0), uButter, 0.4) * spec * (0.9 + 1.2 * uKick);  // glossy highlight
  col += uButter * smoothstep(0.3, 0.55, vDisp) * 0.5 * uKick;       // lobes flash on the kick
  col += uButter * fres * uBuild * uBuild * 1.1;                     // heat rising into the drop
  col += uButter * smoothstep(0.72, 1.0, vTip) * (0.3 + 0.9 * uKick + 0.7 * uDrop); // starburst tips glow

  // breakdowns: thin-film iridescence, kept inside the soda palette
  vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (fres * 1.3 + vDisp * 1.6 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
  irid = mix(irid, uLavender, 0.35) + uPink * 0.15;
  col = mix(col, col * 0.55 + irid * (0.35 + 0.9 * fres), uCalm * 0.6);

  col *= 0.9 + 0.3 * uEnergy;
  col = mix(col, vec3(1.0, 0.96, 0.88) * 1.6, uDrop * uDrop * (0.35 + 0.5 * fres)); // white-hot drop
  gl_FragColor = vec4(col, 1.0);
}`;

/** Thin wire cage around the blob: slow industrial structure, pulses on the kick. */
function Cage() {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), []);
  useFrame((_, dt) => {
    const m = ref.current!;
    const f = features;
    // winds up through a build-up, snaps open on the drop
    m.rotation.y += dt * (0.06 + (f.bpm / 140) * 0.06 * (f.playing ? 1 : 0.3) + f.build * f.build * 1.4 + f.drop * 2);
    m.rotation.x += dt * (0.025 + f.build * 0.3);
    m.scale.setScalar(1 + f.kick * 0.05 - f.build * 0.14 + f.drop * 0.45 + f.snare * 0.03);
    (m.material as THREE.LineBasicMaterial).opacity =
      (0.16 + f.kick * 0.25 + f.energy * 0.08 + f.build * 0.25 + f.drop * 0.5) * (1 - f.calm * 0.6);
  });
  return (
    <lineSegments ref={ref} geometry={geo}>
      <lineBasicMaterial color={PALETTE.lavender} transparent opacity={0.2} toneMapped={false} />
    </lineSegments>
  );
}

export function SodaBlob() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uKick: { value: 0 },
      uEnergy: { value: 0.3 },
      uHigh: { value: 0 },
      uSnare: { value: 0 },
      uBuild: { value: 0 },
      uDrop: { value: 0 },
      uCalm: { value: 0 },
      uBeatPulse: { value: 0 },
      uSpiky: { value: 0 },
      uDirs: { value: SPIKE_DIRS },
      uLen: { value: new Float32Array(SPIKES) },
      uGrape: { value: new THREE.Color(PALETTE.grape) },
      uLavender: { value: new THREE.Color(PALETTE.lavender) },
      uPink: { value: new THREE.Color(PALETTE.bubblegum) },
      uButter: { value: new THREE.Color(PALETTE.butter) },
      uPlum: { value: new THREE.Color(PALETTE.plum) },
    }),
    [],
  );

  const group = useRef<THREE.Group>(null);
  const star = useRef({ x: useDJ.getState().shape === "star" ? 1 : 0, v: 0, lastSnare: 0, hits: new Float32Array(SPIKES) });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // R3F gives the material its own copy of `uniforms`, so write to the live material's set
    const u = (mat.current?.uniforms ?? uniforms) as typeof uniforms;
    const f = features;
    u.uTime.value = f.time;
    u.uBass.value = f.bass;
    u.uKick.value = f.kick;
    u.uEnergy.value = f.energy;
    u.uHigh.value = f.high;
    u.uSnare.value = f.snare;
    u.uBuild.value = f.build;
    u.uDrop.value = f.drop;
    u.uCalm.value = f.calm;
    u.uBeatPulse.value = f.beatPulse;

    // morph between the shapes on a springy curve (overshoots a little, like a pop)
    const st = star.current;
    const target = useDJ.getState().shape === "star" ? 1 : 0;
    // small fixed substeps keep the spring stable even at low frame rates
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      st.v += ((target - st.x) * 90 - st.v * 11) * h;
      st.x += st.v * h;
    }
    u.uSpiky.value = st.x;
    if (st.x > 0.001 || target) {
      // a snare fires a random third of the spikes
      if (f.snare > 0.6 && st.lastSnare <= 0.6) for (let i = 0; i < SPIKES; i++) if (Math.random() < 0.33) st.hits[i] = 1;
      st.lastSnare = f.snare;
      const base = 0.55 + 0.45 * f.energy;
      const build2 = f.build * f.build;
      for (let i = 0; i < SPIKES; i++) {
        st.hits[i] *= Math.exp(-dt * 8);
        const hat = i % 3 === 0 ? f.hat * 0.25 : 0;
        const len =
          base * (0.45 + 0.95 * f.spectrum[SPIKE_BAND[i]]) + f.kick * 0.45 + st.hits[i] * 0.6 + hat + f.drop * 1.0 + build2 * 0.5;
        u.uLen.value[i] = SPIKE_SIZE[i] * len * (1 - f.calm * 0.55);
      }
    }
    // the whole blob spins up through a build-up and keeps the momentum after the drop
    group.current!.rotation.y += dt * (0.04 + f.build * f.build * 0.9 + f.drop * 1.2);
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.35, 96]} />
        <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </mesh>
      <Cage />
    </group>
  );
}
