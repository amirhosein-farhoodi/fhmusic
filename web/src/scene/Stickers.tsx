import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { features, PALETTE } from "./features";

function starShape(points = 5, outer = 0.32, inner = 0.16) {
  const s = new THREE.Shape();
  // rounded star: each corner is a small quadratic curve instead of a sharp point
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const mid = (a: THREE.Vector2, b: THREE.Vector2) => a.clone().lerp(b, 0.5);
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  s.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const e = mid(c, pts[(i + 1) % n]);
    s.quadraticCurveTo(c.x, c.y, e.x, e.y);
  }
  return s;
}

const TUBE_R = 0.2;
const TUBE_r = 0.085;

/**
 * Icing for a donut: a torus whose tube is a little fatter than the dough on the
 * top side and tucked inside it underneath, with a wavy, drippy edge between.
 */
function icingGeometry() {
  const U = 120;
  const V = 32;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= U; i++) {
    const u = (i / U) * Math.PI * 2;
    // drippy edge: a few slow waves plus a couple of deeper drips
    const edge = -0.15 + 0.18 * Math.sin(u * 5 + 0.7) + 0.1 * Math.sin(u * 11 + 2.1) - 0.25 * Math.pow(Math.max(0, Math.sin(u * 3 + 1)), 8);
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * Math.PI * 2;
      const up = Math.sin(v); // +1 on top of the donut (towards +z)
      const cover = THREE.MathUtils.smoothstep(up, edge - 0.08, edge + 0.08);
      const r = TUBE_r * (0.86 + 0.24 * cover);
      const cx = Math.cos(u) * TUBE_R;
      const cy = Math.sin(u) * TUBE_R;
      pos.push(cx + Math.cos(u) * Math.cos(v) * r, cy + Math.sin(u) * Math.cos(v) * r, Math.sin(v) * r);
    }
  }
  for (let i = 0; i < U; i++)
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j;
      const b = a + V + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SPRINKLES = 26;
const SPRINKLE_COLORS = [PALETTE.butter, "#ffffff", PALETTE.bubblegum, PALETTE.lavender, "#8fe3ff"];

/** Matrices for sprinkles lying on the top of the icing. */
function sprinkleMatrices(seed: number) {
  const out: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < SPRINKLES; k++) {
    const u = rnd() * Math.PI * 2;
    const v = 0.35 + rnd() * (Math.PI - 0.7); // top half of the tube only
    const r = TUBE_r * 1.1;
    const n = new THREE.Vector3(Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v), Math.sin(v));
    o.position.set(Math.cos(u) * TUBE_R + n.x * r, Math.sin(u) * TUBE_R + n.y * r, n.z * r);
    // lie flat on the surface, pointing in a random direction
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    o.rotateZ(rnd() * Math.PI);
    o.rotateY(Math.PI / 2);
    o.updateMatrix();
    out.push(o.matrix.clone());
  }
  return out;
}

type Kind = "star" | "donut" | "gem" | "dot";
const KINDS: { kind: Kind; color: string }[] = [
  { kind: "star", color: PALETTE.butter },
  { kind: "donut", color: PALETTE.bubblegum },
  { kind: "gem", color: PALETTE.lavender },
  { kind: "dot", color: PALETTE.butter },
  { kind: "donut", color: PALETTE.lavender },
  { kind: "star", color: PALETTE.bubblegum },
  { kind: "gem", color: PALETTE.bubblegum },
  { kind: "dot", color: PALETTE.lavender },
  { kind: "star", color: PALETTE.lavender },
  { kind: "donut", color: PALETTE.butter },
  { kind: "gem", color: PALETTE.butter },
  { kind: "dot", color: PALETTE.bubblegum },
];

/** Glossy candy material: clearcoat, and a satin sheen. */
function candy(color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.6,
    sheenColor: new THREE.Color(PALETTE.bubblegum),
    sheenRoughness: 0.4,
    emissive: c,
    emissiveIntensity: 0.12,
    ...extra,
  });
}

function Sticker({ kind, color, index }: { kind: Kind; color: string; index: number }) {
  const parts = useMemo(() => {
    if (kind === "star") {
      const g = new THREE.ExtrudeGeometry(starShape(), {
        depth: 0.06,
        bevelEnabled: true,
        bevelSize: 0.06,
        bevelThickness: 0.09,
        bevelSegments: 10,
        curveSegments: 10,
      });
      g.center();
      return { glow: [candy(color)], node: (m: THREE.Material[]) => <mesh geometry={g} material={m[0]} /> };
    }
    if (kind === "donut") {
      const dough = new THREE.TorusGeometry(TUBE_R, TUBE_r, 24, 64);
      const icing = icingGeometry();
      const sprinkle = new THREE.CapsuleGeometry(0.008, 0.03, 3, 6);
      const doughMat = new THREE.MeshPhysicalMaterial({ color: "#f3c98e", roughness: 0.75, sheen: 1, sheenColor: new THREE.Color("#ffe2b8") });
      const icingMat = candy(color, { roughness: 0.18 });
      const sprinkleMat = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 0.15 });
      const mats = sprinkleMatrices(index * 7919 + 13);
      const col = new THREE.Color();
      return {
        glow: [icingMat],
        node: () => (
          <>
            <mesh geometry={dough} material={doughMat} />
            <mesh geometry={icing} material={icingMat} />
            <instancedMesh
              args={[sprinkle, sprinkleMat, SPRINKLES]}
              ref={(im) => {
                if (!im) return;
                mats.forEach((m, k) => {
                  im.setMatrixAt(k, m);
                  im.setColorAt(k, col.set(SPRINKLE_COLORS[(k + index) % SPRINKLE_COLORS.length]));
                });
                im.instanceMatrix.needsUpdate = true;
                if (im.instanceColor) im.instanceColor.needsUpdate = true;
              }}
            />
          </>
        ),
      };
    }
    if (kind === "gem") {
      // a faceted crystal: sharp facets catch the reflections and flash as it spins
      const g = new THREE.OctahedronGeometry(0.21, 0);
      g.scale(1, 1.35, 1);
      const m = candy(color, { flatShading: true, roughness: 0.05, sheen: 0, emissiveIntensity: 0.2 });
      return { glow: [m], node: (ms: THREE.Material[]) => <mesh geometry={g} material={ms[0]} /> };
    }
    // a pearly gumball
    const g = new THREE.SphereGeometry(0.13, 48, 32);
    const m = candy(color, { roughness: 0.15 });
    return { glow: [m], node: (ms: THREE.Material[]) => <mesh geometry={g} material={ms[0]} /> };
  }, [kind, color, index]);

  return <group userData={{ glow: parts.glow }}>{parts.node(parts.glow)}</group>;
}

/** Playful floating candy 'stickers' (stars, donuts, gems, gumballs) that bop on the beat. */
export function Stickers() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const orbits = useMemo(
    () =>
      KINDS.map((_, i) => ({
        r: 5.2 + (i % 3) * 0.9 + Math.random() * 0.6,
        phase: (i / KINDS.length) * Math.PI * 2,
        y: (Math.random() - 0.5) * 3.2,
        speed: 0.6 + Math.random() * 0.6,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.4),
      })),
    [],
  );

  useFrame((_, dt) => {
    const f = features;
    const t = f.time;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const o = orbits[i];
      const a = o.phase + t * 0.08 * o.speed;
      g.position.set(Math.cos(a) * o.r, o.y + Math.sin(t * 0.7 + i) * 0.25, Math.sin(a) * o.r * 0.45 - 0.8);
      g.rotation.x += dt * o.spin.x * (0.4 + f.energy);
      g.rotation.y += dt * o.spin.y * (0.4 + f.energy);
      // bop: alternate stickers pop on alternating beats, the others answer the snare
      const onBeat = Math.floor(f.step / 4) % 2 === i % 2;
      const hit = onBeat ? f.kick * 0.35 : f.snare * 0.3;
      // squash and stretch on the hit, like a gummy
      const s = (1 + hit + f.drop * 0.5) * (1 - f.build * f.build * 0.3);
      g.scale.set(s * (1 + hit * 0.25), s * (1 - hit * 0.2), s);
      // they glow from inside on their hit, and burn bright on the drop
      const sticker = g.children[0];
      const glow = (sticker?.userData.glow ?? []) as THREE.MeshPhysicalMaterial[];
      for (const m of glow) m.emissiveIntensity = 0.12 + hit * 0.9 + f.drop * 0.8 + f.energy * 0.08;
    });
  });

  return (
    <>
      {KINDS.map((k, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)}>
          <Sticker kind={k.kind} color={k.color} index={i} />
        </group>
      ))}
    </>
  );
}
