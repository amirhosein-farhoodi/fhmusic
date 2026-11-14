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
varying vec3 vNormal;
varying vec3 vView;
${NOISE}
void main(){
  float slow = snoise(normal * 1.3 + vec3(0.0, uTime * 0.35, uTime * 0.2));
  float fine = snoise(normal * 4.2 + uTime * 0.9);
  float d = slow * (0.16 + 0.42 * uBass + 0.2 * uEnergy) + fine * 0.05 * (1.0 + 2.5 * uHigh);
  vDisp = d;
  vec3 p = position + normal * d;
  p *= 1.0 + 0.09 * uKick;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uGrape, uLavender, uPink, uButter, uPlum;
uniform float uKick, uEnergy;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
void main(){
  float fres = pow(1.0 - max(dot(normalize(vNormal), vView), 0.0), 2.4);
  vec3 col = mix(uPlum, uGrape, smoothstep(-0.35, 0.05, vDisp));
  col = mix(col, uLavender, smoothstep(0.0, 0.3, vDisp));
  col = mix(col, uPink, fres * 0.85);
  col += uButter * smoothstep(0.28, 0.55, vDisp) * (0.35 + 0.9 * uKick);
  col *= 0.85 + 0.5 * uEnergy + 0.35 * uKick;
  gl_FragColor = vec4(col, 1.0);
}`;

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
    <mesh>
      <icosahedronGeometry args={[1.35, 64]} />
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
}
