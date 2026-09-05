import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrescentRose } from '../lib/crescent-rose.ts';
import { createTransformationPlayback } from '../lib/transformation-playback.ts';
import { smoothStage, TRANSFORM_DURATION } from '../lib/crescent-rig.ts';

const playback = createTransformationPlayback(TRANSFORM_DURATION);
playback.playTo('rifle');
playback.tick(1.3);
assert(Math.abs(playback.getState().progress - 0.25) < 1e-10);
playback.togglePause();
const paused = playback.getState().progress;
playback.tick(10);
assert.equal(playback.getState().progress, paused);
playback.togglePause();
playback.tick(3.9);
assert.equal(playback.getState().progress, 1);
playback.playTo('scythe');
playback.tick(TRANSFORM_DURATION);
assert.equal(playback.getState().progress, 0);
assert.equal(playback.getState().playing, false);
playback.setSpeed(0.5);
playback.playTo('rifle');
playback.tick(TRANSFORM_DURATION);
assert(Math.abs(playback.getState().progress - 0.5) < 1e-10);
playback.seek(0.35);
assert.equal(playback.getState().progress, 0.35);
assert.equal(playback.getState().playing, false);
assert.throws(() => playback.seek(NaN));
assert.equal(playback.getState().progress, 0.35);
for (const fps of [30, 60, 144]) {
  const clock = createTransformationPlayback(TRANSFORM_DURATION);
  clock.playTo('rifle');
  for (let i = 0; i < fps * 2; i++) clock.tick(1 / fps);
  assert(
    Math.abs(clock.getState().progress - 2 / TRANSFORM_DURATION) < 1e-10,
    `Timing changed at ${fps} FPS`,
  );
  clock.tick(10);
  assert.equal(clock.getState().progress, 1);
}
// Quintic easing has zero endpoint velocity and acceleration.
for (const end of [0, 1]) {
  const epsilon = 1e-4;
  const sample = smoothStage(end === 0 ? epsilon : 1 - epsilon, 0, 1);
  assert(Math.abs(sample - end) < 1e-9);
}
const model = createCrescentRose();
const initial = [];
const geometries = new Map();
model.root.traverse((node) => {
  initial.push([node, node.matrixWorld.clone()]);
  if (node.isMesh)
    geometries.set(node, node.geometry.getAttribute('position').array.slice());
});
const hingeBases = new Map(
  ['mainFold', 'lowerFold', 'tipFold', 'counterFold', 'counterTip'].map(
    (name) => [name, model.rig[name].position.clone()],
  ),
);
for (let i = 0; i <= 200; i++) {
  model.setTransformation(i / 200);
  model.root.traverse((node) => {
    assert(
      node.matrixWorld.elements.every(Number.isFinite),
      `Invalid transform on ${node.name}`,
    );
    assert.equal(node.visible, true, `Part disappeared: ${node.name}`);
    assert(
      node.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-10,
      `Part was scaled: ${node.name}`,
    );
  });
  for (const [name, base] of hingeBases) {
    const p = model.rig[name].position;
    assert(
      Math.abs(base.x - p.x) < 1e-10 && Math.abs(base.y - p.y) < 1e-10,
      `${name} moved off its hinge axis`,
    );
  }
}
const rifleBounds = new THREE.Box3().setFromObject(model.root);
const rifleSize = rifleBounds.getSize(new THREE.Vector3());
assert(
  rifleSize.x / rifleSize.y > 2.5,
  'Rifle did not fold into a horizontal profile',
);
assert(
  rifleSize.x < model.bounds.getSize(new THREE.Vector3()).y * 0.7,
  'Shaft did not retract',
);
model.setBoltProgress(0.5);
const openBolt = model.rig.boltSlide.position.y;
assert(openBolt > 0.25);
model.setBoltProgress(1);
assert(Math.abs(model.rig.boltSlide.position.y) < 1e-10);
for (let loop = 0; loop < 30; loop++) {
  model.setTransformation(1);
  model.setTransformation(0.41);
  model.setTransformation(0);
}
model.setExplode(0.65);
model.setExplode(0);
for (const [node, matrix] of initial)
  assert(
    node.matrixWorld.elements.every(
      (value, i) => Math.abs(value - matrix.elements[i]) < 1e-8,
    ),
    `Round-trip drift: ${node.name}`,
  );
for (const [mesh, data] of geometries)
  assert.deepEqual(
    mesh.geometry.getAttribute('position').array,
    data,
    'Folding deformed a rigid part',
  );
model.setTransformation(0.63);
const beforeClip = new THREE.Box3().setFromObject(model.root);
const clip = model.createAnimationClip();
assert.equal(clip.duration, TRANSFORM_DURATION);
assert(clip.validate());
const afterClip = new THREE.Box3().setFromObject(model.root);
assert(beforeClip.min.distanceTo(afterClip.min) < 1e-9);
assert(beforeClip.max.distanceTo(afterClip.max) < 1e-9);
assert.throws(() => model.setTransformation(Infinity));
assert.equal(model.getTransformation(), 0.63);
model.dispose();
console.log(
  'PASS: 201 rigid poses; fixed hinge axes; 30 drift-free reverse cycles; pause/seek/speed; 30/60/144 FPS timing; bolt cycle; animation sampling.',
);
