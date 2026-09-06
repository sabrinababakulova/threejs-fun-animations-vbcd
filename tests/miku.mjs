import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMiku } from '../lib/miku-character.ts';
import { addMikuDetails } from '../lib/miku-details.ts';

const file = fs.readFileSync('public/models/miku/miku.glb');
const gltf = await new GLTFLoader().parseAsync(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  '',
);
const model = prepareMiku(gltf.scene);
assert.equal(
  model.meshes.length,
  17,
  'Material sections must survive conversion',
);
assert.equal(
  model.hair.length,
  14,
  'Both complete hair chains must be present',
);
let triangles = 0;
for (const mesh of model.meshes) {
  const g = mesh.geometry;
  triangles += g.index.count / 3;
  for (const name of ['position', 'normal', 'skinWeight'])
    assert(
      [...g.attributes[name].array].every(Number.isFinite),
      `${name} is finite`,
    );
  for (let i = 0; i < g.attributes.skinWeight.count; i++) {
    const weights = g.attributes.skinWeight;
    assert(
      Math.abs(
        weights.getX(i) +
          weights.getY(i) +
          weights.getZ(i) +
          weights.getW(i) -
          1,
      ) < 0.00001,
      'Skin weights sum to one',
    );
  }
}
assert(triangles > 60000 && triangles < 100000);
model.root.updateMatrixWorld(true);
const bounds = new T.Box3().setFromObject(model.root, true);
// A minimal canvas drawing surface lets this test inspect actual projected
// geometry in Node. Texture appearance is deliberately outside this check.
const context = new Proxy({}, { get: () => () => {}, set: () => true });
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  },
});
const details = addMikuDetails(model);
const markings = model.root.getObjectByName('Costume markings');
assert.equal(
  markings.children.length,
  4,
  'Arm mark, both sleeve panels and chest nameplate project onto the model',
);
for (const marking of markings.children) {
  assert(
    marking.geometry.attributes.position.count > 3,
    'Decals contain visible geometry',
  );
  assert(
    [...marking.geometry.attributes.position.array].every(Number.isFinite),
  );
}
details.dispose();
delete globalThis.document;
assert(bounds.min.y > -0.0001 && bounds.min.y < 0.0001, 'Boots rest on ground');
assert(
  bounds.max.y > 1.95 && bounds.max.y < 2.1,
  'Human proportions preserved',
);
const stationary = [...model.bones]
  .filter(([name]) => !/^[左右]髪[１-７]$/.test(name))
  .map(([name, bone]) => ({ name, bone, matrix: bone.matrixWorld.clone() }));
const roots = model.hair
  .filter((h) => h.depth === 0)
  .map((h) => ({
    bone: h.bone,
    position: h.bone.getWorldPosition(new T.Vector3()),
    rotation: h.bone.quaternion.clone(),
  }));
const tip = model.hair.find((h) => h.depth === 6).bone;
const tipStart = tip.getWorldPosition(new T.Vector3());
let tipTravel = 0;
for (let frame = 0; frame <= 180; frame++) {
  model.updateHair(frame / 30, 1.6);
  model.root.updateMatrixWorld(true);
  tipTravel = Math.max(
    tipTravel,
    tip.getWorldPosition(new T.Vector3()).distanceTo(tipStart),
  );
  for (const { bone, position, rotation } of roots) {
    assert(
      bone.getWorldPosition(new T.Vector3()).distanceTo(position) < 1e-7,
      'Hair root stays in its clip',
    );
    assert(
      1 - Math.abs(bone.quaternion.dot(rotation)) < 1e-7,
      'Clip orientation stays fixed',
    );
  }
  for (const { name, bone, matrix } of stationary) {
    assert(
      bone.matrixWorld.elements.every(
        (v, i) => Math.abs(v - matrix.elements[i]) < 1e-7,
      ),
      `${name}: body must not animate`,
    );
  }
  for (const h of model.hair)
    assert(
      h.bone.getWorldPosition(new T.Vector3()).y > -0.02,
      'Hair joints stay above floor',
    );
}
assert(
  tipTravel > 0.03 && tipTravel < 0.7,
  'Hair visibly flows within a bounded range',
);
model.updateHair(2, 0.8);
const paused = model.hair.map((h) => h.bone.quaternion.clone());
for (let i = 0; i < 120; i++) model.updateHair(2, 0.8);
model.hair.forEach((h, i) =>
  assert.deepEqual(
    h.bone.quaternion.toArray(),
    paused[i].toArray(),
    'Paused hair never drifts',
  ),
);
model.updateHair(0, 0);
model.hair.forEach((h) =>
  assert.deepEqual(
    h.bone.quaternion.toArray(),
    h.base.toArray(),
    'Zero breeze returns the rest pose',
  ),
);
model.setFinish('toon');
assert(model.meshes.every((m) => m.material instanceof T.MeshToonMaterial));
model.setFinish('studio');
assert(model.meshes.every((m) => m.material instanceof T.MeshPhysicalMaterial));
model.dispose();
console.log(
  `Miku verified: ${triangles.toLocaleString()} triangles; anchored clips; stationary body; bounded hair motion; pause; both finishes.`,
);
