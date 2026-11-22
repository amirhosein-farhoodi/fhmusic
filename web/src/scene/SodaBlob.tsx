import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
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

const vertexShader = /* glsl */ `
uniform float uTime, uBass, uKick, uEnergy, uHigh;
varying float vDisp;
varying vec3 vPos;
${NOISE}
void main(){
  // big, slow, smooth lobes (bass) + a little surface shimmer (hats)
  float slow = snoise(normal * 1.1 + vec3(0.0, uTime * 0.3, uTime * 0.18));
  float fine = snoise(normal * 3.2 + uTime * 0.8);
  float d = slow * (0.14 + 0.38 * uBass + 0.16 * uEnergy) + fine * 0.025 * (1.0 + 2.0 * uHigh);
  vDisp = d;
  vec3 p = (position + normal * d) * (1.0 + 0.08 * uKick);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

// Glossy 'soda candy' shading: real lighting from the displaced surface,
// a sharp specular highlight, a pink rim and swirl bands that follow the
// shape, so the blob reads as a solid 3D object instead of a purple cloud.
const fragmentShader = /* glsl */ `
uniform vec3 uGrape, uLavender, uPink, uButter, uPlum;
uniform float uKick, uEnergy, uTime;
varying float vDisp;
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
  // candy swirl bands drifting over the surface
  float band = smoothstep(0.55, 0.75, sin(vDisp * 22.0 - uTime * 1.6) * 0.5 + 0.5);
  body = mix(body, uPink, band * 0.35);

  vec3 col = uPlum * 0.6 + body * (0.35 + 0.85 * diff) + uPink * back * 0.25;
  col += uPink * fres * 0.9;                                  // rim light
  col += mix(vec3(1.0), uButter, 0.4) * spec * (0.9 + 1.2 * uKick); // glossy highlight
  col += uButter * smoothstep(0.3, 0.55, vDisp) * 0.5 * uKick;      // lobes flash on the kick
  col *= 0.9 + 0.3 * uEnergy;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Thin wire cage around the blob: slow industrial structure, pulses on the kick. */
function Cage() {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), []);
  useFrame((_, dt) => {
    const m = ref.current!;
    m.rotation.y += dt * (0.06 + (features.bpm / 140) * 0.06 * (features.playing ? 1 : 0.3));
    m.rotation.x += dt * 0.025;
    m.scale.setScalar(1 + features.kick * 0.05);
    (m.material as THREE.LineBasicMaterial).opacity = 0.16 + features.kick * 0.25 + features.energy * 0.08;
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
      uGrape: { value: new THREE.Color(PALETTE.grape) },
      uLavender: { value: new THREE.Color(PALETTE.lavender) },
      uPink: { value: new THREE.Color(PALETTE.bubblegum) },
      uButter: { value: new THREE.Color(PALETTE.butter) },
      uPlum: { value: new THREE.Color(PALETTE.plum) },
    }),
    [],
  );

  useFrame(() => {
    const u = uniforms;
    u.uTime.value = features.time;
    u.uBass.value = features.bass;
    u.uKick.value = features.kick;
    u.uEnergy.value = features.energy;
    u.uHigh.value = features.high;
  });

  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[1.35, 96]} />
        <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </mesh>
      <Cage />
    </group>
  );
}
