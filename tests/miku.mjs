import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareMiku } from '../lib/miku-character.ts';
import { addMikuDetails } from '../lib/miku-details.ts';
import { createOrbitMotionTracker } from '../lib/miku-hair-physics.ts';

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
  const spin =
    frame >= 30 && frame < 60 ? 5 : frame >= 60 && frame < 90 ? -5 : 0;
  model.hairPhysics.advance(1 / 30, 1.6, new T.Vector3(0, spin, 0));
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
  tipTravel > 0.1 && tipTravel < 2,
  'Hair visibly flows within a bounded range',
);
const paused = model.hair.map((h) => h.bone.quaternion.clone());
for (let i = 0; i < 120; i++)
  model.hairPhysics.advance(0, 0.8, new T.Vector3(0, 7, 0));
model.hair.forEach((h, i) =>
  assert.deepEqual(
    h.bone.quaternion.toArray(),
    paused[i].toArray(),
    'Paused hair never drifts',
  ),
);
model.hairPhysics.reset();
model.hair.forEach((h) =>
  assert.deepEqual(
    h.bone.quaternion.toArray(),
    h.base.toArray(),
    'Reset returns the authored rest pose',
  ),
);
model.setFinish('toon');
assert(model.meshes.every((m) => m.material instanceof T.MeshToonMaterial));
model.setFinish('studio');
assert(model.meshes.every((m) => m.material instanceof T.MeshPhysicalMaterial));

// Sample genuine camera deltas: crossing the seam, reset, zoom/pan (unchanged
// angles), and preset transitions must not produce accidental spin impulses.
const tracker = createOrbitMotionTracker();
tracker.sample(Math.PI - 0.01, 1.5, 1 / 60, true);
assert(
  Math.abs(tracker.sample(-Math.PI + 0.01, 1.5, 1 / 60, true).y + 1.2) < 1e-7,
  'Azimuth wrap follows the short arc',
);
assert.equal(
  tracker.sample(-Math.PI + 0.01, 1.5, 1 / 60, true).length(),
  0,
  'Pan and zoom leave hair unforced',
);
assert.equal(
  tracker.sample(0, 0.8, 1 / 60, false).length(),
  0,
  'Camera presets do not whip the hair',
);
tracker.reset();
assert.equal(
  tracker.sample(2, 1.1, 1 / 60, true).length(),
  0,
  'A fresh view starts with no impulse',
);
assert(
  tracker.sample(2.02, 1.15, 1 / 60, true).length() > 1,
  'Vertical and horizontal drags drive the physics',
);
assert.equal(
  tracker.sample(0, 0, 2, true).length(),
  0,
  'A hidden-tab time gap does not inject a large impulse',
);

function warmup() {
  model.hairPhysics.reset();
  for (let frame = 0; frame < 600; frame++)
    model.hairPhysics.advance(1 / 120, 0);
  return model.hairPhysics.getState();
}
function displacement(a, b) {
  return Math.max(...a.map((p, i) => p.tail.distanceTo(b[i].tail)));
}
const settled = warmup();
function spinDistance(speed) {
  warmup();
  let maximum = 0;
  for (let frame = 0; frame < 120; frame++) {
    model.hairPhysics.advance(1 / 120, 0, new T.Vector3(0, speed, 0));
    maximum = Math.max(
      maximum,
      displacement(model.hairPhysics.getState(), settled),
    );
  }
  return maximum;
}
const gentle = spinDistance(0.8),
  fast = spinDistance(4);
assert(fast > gentle * 1.35, 'A fast drag creates more swing than a slow drag');
const atRelease = model.hairPhysics.getState();
for (let frame = 0; frame < 24; frame++) model.hairPhysics.advance(1 / 120, 0);
assert(
  displacement(model.hairPhysics.getState(), atRelease) > 0.03,
  'Hair keeps moving after release',
);
for (let frame = 0; frame < 1200; frame++)
  model.hairPhysics.advance(1 / 120, 0);
assert(
  displacement(model.hairPhysics.getState(), settled) < 0.01,
  'Air resistance settles the hair in still air',
);

function runGesture(fps) {
  warmup();
  const sampled = Array.from({ length: 4 }, () => null);
  for (let frame = 0; frame < fps * 4; frame++) {
    const t = (frame + 0.5) / fps;
    const yaw = t < 2 ? 3 * Math.sin(t * Math.PI) : 0;
    const pitch = t < 2 ? 0.7 * Math.sin(t * Math.PI * 2) : 0;
    model.hairPhysics.advance(1 / fps, 0, new T.Vector3(pitch, yaw, 0));
    for (const p of model.hairPhysics.getState()) {
      assert(p.tail.toArray().every(Number.isFinite));
      assert(
        p.tail.y >= p.radius + 0.011,
        'Hair particles stay above the ground',
      );
      const joint = model.hair.find(
        (j) => j.side === p.side && j.depth === p.depth,
      );
      const origin = joint.bone.getWorldPosition(new T.Vector3());
      assert(
        Math.abs(p.tail.distanceTo(origin) - p.length) < 1e-6,
        'Strands do not stretch',
      );
      // Check the swept strand, not just its endpoint, against the torso.
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        const q = origin.clone().lerp(p.tail, fraction);
        const torso = new T.Vector3(
          0,
          T.MathUtils.clamp(q.y, 1.12, 1.49),
          -0.015,
        );
        assert(
          q.distanceTo(torso) > 0.16 + p.radius - 0.003,
          'Hair does not pass through the torso',
        );
      }
    }
    if ((frame + 1) % fps === 0)
      sampled[(frame + 1) / fps - 1] = model.hairPhysics.getState();
  }
  return sampled;
}
const at30 = runGesture(30),
  at60 = runGesture(60),
  at144 = runGesture(144);
const refreshDifference = Math.max(
  ...at30.map((s, i) =>
    Math.max(displacement(s, at60[i]), displacement(s, at144[i])),
  ),
);
assert(
  refreshDifference < 0.05,
  `Hair response stays consistent at 30/60/144 FPS (${refreshDifference})`,
);
model.dispose();
console.log(
  `Miku verified: ${triangles.toLocaleString()} triangles; anchored clips; stationary body; inertial drag/release; collisions; pause; 30/60/144 FPS (max difference ${refreshDifference.toFixed(4)} m).`,
);
