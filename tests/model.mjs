import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCrescentRose } from '../lib/crescent-rose.ts';

// Only Blob reading needs a browser shim; geometry and glTF run directly in Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const model = createCrescentRose();
let meshes = 0,
  triangles = 0;
model.root.traverse((mesh) => {
  if (!mesh.isMesh) return;
  meshes++;
  for (const name of ['position', 'normal']) {
    const attribute = mesh.geometry.getAttribute(name);
    assert(attribute, `${mesh.name}: missing ${name}`);
    assert(
      [...attribute.array].every(Number.isFinite),
      `${mesh.name}: invalid ${name}`,
    );
  }
  triangles +=
    (mesh.geometry.index?.count ??
      mesh.geometry.getAttribute('position').count) / 3;
});
assert(
  model.bounds.max.y - model.bounds.min.y > 10,
  'Scythe profile unexpectedly collapsed',
);
assert(
  model.bounds.max.x - model.bounds.min.x > 6,
  'Crescent blade profile unexpectedly collapsed',
);
model.setExplode(1);
assert(
  Object.values(model.groups).every((group) => group.position.length() > 0),
  'An assembly failed to separate',
);
model.setExplode(0);
assert(
  Object.values(model.groups).every((group) => group.position.length() === 0),
  'Separated assemblies did not reset',
);
for (const finish of ['wireframe', 'original', 'studio'])
  model.setFinish(finish);
const result = await new GLTFExporter().parseAsync(model.root, {
  binary: true,
});
assert(result instanceof ArrayBuffer);
const header = new DataView(result);
assert.equal(header.getUint32(0, true), 0x46546c67);
assert.equal(header.getUint32(4, true), 2);
const imported = await new GLTFLoader().parseAsync(result, '');
let importedMeshes = 0;
imported.scene.traverse((m) => {
  if (m.isMesh) importedMeshes++;
});
assert.equal(importedMeshes, meshes, 'Export lost mesh objects');
const importedBounds = new THREE.Box3().setFromObject(imported.scene);
assert(
  importedBounds.min.distanceTo(model.bounds.min) < 0.001,
  'Export changed the minimum bounds',
);
assert(
  importedBounds.max.distanceTo(model.bounds.max) < 0.001,
  'Export changed the maximum bounds',
);
fs.mkdirSync('outputs', { recursive: true });
fs.writeFileSync('outputs/crescent-rose.glb', Buffer.from(result));
console.log(
  `PASS: ${meshes} meshes / ${triangles} triangles; finite geometry, assembly reset, and GLB export/import round trip. GLB: ${String(result.byteLength)} bytes.`,
);
model.dispose();
