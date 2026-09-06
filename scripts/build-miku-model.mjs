// Converts the attributed Animasa PMD source into a self-contained skinned glTF.
// Run with node scripts/build-miku-model.mjs. No MMD runtime is shipped.
import fs from 'node:fs';
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const bytes = fs.readFileSync(
  new URL('../public/models/miku/miku-original.pmd', import.meta.url),
);
let offset = 0;
const u8 = () => bytes.readUInt8(offset++);
const u16 = () => {
  const v = bytes.readUInt16LE(offset);
  offset += 2;
  return v;
};
const u32 = () => {
  const v = bytes.readUInt32LE(offset);
  offset += 4;
  return v;
};
const f32 = () => {
  const v = bytes.readFloatLE(offset);
  offset += 4;
  return v;
};
const vec = (n) => Array.from({ length: n }, f32);
const str = (n) => {
  const b = bytes.subarray(offset, offset + n);
  offset += n;
  return new TextDecoder('shift_jis').decode(
    b.subarray(0, b.indexOf(0) < 0 ? n : b.indexOf(0)),
  );
};
if (str(3) !== 'Pmd' || f32() !== 1) throw new Error('Expected PMD v1');
str(20);
str(256);
const vertices = Array.from({ length: u32() }, () => {
  const p = vec(3),
    n = vec(3),
    uv = vec(2),
    joints = [u16(), u16()],
    w = u8() / 100;
  u8();
  p[2] *= -1;
  n[2] *= -1;
  uv[1] = 1 - uv[1];
  return { p, n, uv, joints, weights: [w, 1 - w] };
});
const indices = Array.from({ length: u32() }, u16);
for (let i = 0; i < indices.length; i += 3)
  [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
const sourceMaterials = Array.from({ length: u32() }, () => {
  const diffuse = vec(4);
  f32();
  vec(3);
  vec(3);
  u8();
  u8();
  return { diffuse, count: u32(), texture: str(20) };
});
const sourceBones = Array.from({ length: u16() }, () => {
  const name = str(20),
    parent = u16();
  u16();
  u8();
  u16();
  const p = vec(3);
  p[2] *= -1;
  return { name, parent: parent === 65535 ? -1 : parent, p };
});

// Curved midpoint subdivision rounds the hair/skin silhouettes while preserving
// the authored normals, UV seams and skin weights. Flat clothing details stay crisp.
const groups = [],
  finalIndices = [],
  midpoints = new Map();
function midpoint(a, b, curved) {
  const key = `${a < b ? `${a}:${b}` : `${b}:${a}`}:${curved}`;
  if (midpoints.has(key)) return midpoints.get(key);
  const v = vertices[a],
    w = vertices[b];
  const p = v.p.map((x, i) => (x + w.p[i]) / 2);
  const pa = p.reduce((sum, x, i) => sum + (x - v.p[i]) * v.n[i], 0);
  const pb = p.reduce((sum, x, i) => sum + (x - w.p[i]) * w.n[i], 0);
  const dot = v.n.reduce((sum, x, i) => sum + x * w.n[i], 0);
  if (curved && dot > 0.35)
    p.forEach((x, i) => {
      p[i] = x - (pa * v.n[i] + pb * w.n[i]) * 0.2;
    });
  const normal = new T.Vector3(...v.n)
    .add(new T.Vector3(...w.n))
    .normalize()
    .toArray();
  const weights = new Map();
  for (const entry of [v, w])
    entry.joints.forEach((j, i) =>
      weights.set(j, (weights.get(j) ?? 0) + entry.weights[i] * 0.5),
    );
  const skin = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4),
    total = skin.reduce((s, x) => s + x[1], 0);
  const index = vertices.length;
  vertices.push({
    p,
    n: normal,
    uv: v.uv.map((x, i) => (x + w.uv[i]) / 2),
    joints: skin.map((x) => x[0]),
    weights: skin.map((x) => x[1] / total),
  });
  midpoints.set(key, index);
  return index;
}
let start = 0;
sourceMaterials.forEach((mat, i) => {
  const groupStart = finalIndices.length;
  for (let j = start; j < start + mat.count; j += 3) {
    const [a, b, c] = indices.slice(j, j + 3);
    if ([1, 2, 3, 4].includes(i)) {
      const curved = [1, 2].includes(i);
      const ab = midpoint(a, b, curved),
        bc = midpoint(b, c, curved),
        ca = midpoint(c, a, curved);
      finalIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    } else finalIndices.push(a, b, c);
  }
  groups.push({
    start: groupStart,
    count: finalIndices.length - groupStart,
    materialIndex: i,
  });
  start += mat.count;
});
const geometry = new T.BufferGeometry();
geometry.setAttribute(
  'position',
  new T.Float32BufferAttribute(
    vertices.flatMap((v) => v.p),
    3,
  ),
);
geometry.setAttribute(
  'normal',
  new T.Float32BufferAttribute(
    vertices.flatMap((v) => v.n),
    3,
  ),
);
geometry.setAttribute(
  'uv',
  new T.Float32BufferAttribute(
    vertices.flatMap((v) => v.uv),
    2,
  ),
);
geometry.setAttribute(
  'skinIndex',
  new T.Uint16BufferAttribute(
    vertices.flatMap((v) =>
      Array.from({ length: 4 }, (_, i) => v.joints[i] ?? 0),
    ),
    4,
  ),
);
geometry.setAttribute(
  'skinWeight',
  new T.Float32BufferAttribute(
    vertices.flatMap((v) =>
      Array.from({ length: 4 }, (_, i) => v.weights[i] ?? 0),
    ),
    4,
  ),
);
geometry.setIndex(finalIndices);
geometry.groups = groups;
const names = [
  'Turquoise trim',
  'Turquoise hair',
  'Skin',
  'Graphite outfit',
  'Silver vest',
  'Trim highlights',
  'Iris',
  'Headset and seams',
  'Rose indicators',
  'Gold controls',
  'Blue indicators',
  'Eyelashes',
  'Mouth',
  'Lash shading',
  'Lips',
  'Eye whites',
  'Trim shadows',
];
const colors = [
  '#20b8ba',
  '#20afa9',
  '#ffe6db',
  '#202630',
  '#c8d1d7',
  '#41cec4',
  '#ffffff',
  '#10151f',
  '#d82765',
  '#d2b856',
  '#add6e5',
  '#17232b',
  '#ca3b53',
  '#5a3939',
  '#dc9b9c',
  '#fffdf9',
  '#148c91',
];
const materials = sourceMaterials.map(
  (m, i) =>
    new T.MeshStandardMaterial({
      name: names[i],
      color: colors[i],
      roughness: i === 1 ? 0.34 : i === 2 ? 0.83 : 0.43,
      metalness: [0, 4, 7].includes(i) ? 0.32 : 0,
      side: T.DoubleSide,
    }),
);
const root = new T.Group();
root.name = 'Hatsune Miku';
const bones = sourceBones.map((b) => {
  const bone = new T.Bone();
  bone.name = b.name;
  bone.userData.sourceName = b.name;
  return bone;
});
sourceBones.forEach((b, i) => {
  bones[i].position.fromArray(b.p);
  if (b.parent >= 0) {
    bones[i].position.sub(new T.Vector3(...sourceBones[b.parent].p));
    bones[b.parent].add(bones[i]);
  } else root.add(bones[i]);
});
root.updateMatrixWorld(true);
const mesh = new T.SkinnedMesh(geometry, materials);
mesh.name = 'Classic Miku';
root.add(mesh);
mesh.bind(new T.Skeleton(bones));
mesh.normalizeSkinWeights();
root.userData = {
  model: 'Animasa Hatsune Miku v2.3',
  character: '© Crypton Future Media, INC.',
  adaptation:
    'Curved surface subdivision, material restoration and hair rig for this viewer.',
};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const glb = await new GLTFExporter().parseAsync(root, { binary: true });
fs.writeFileSync(
  new URL('../public/models/miku/miku.glb', import.meta.url),
  Buffer.from(glb),
);
console.log(
  `Miku: ${vertices.length.toLocaleString()} vertices, ${(finalIndices.length / 3).toLocaleString()} triangles, ${bones.length} bones; ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`,
);
