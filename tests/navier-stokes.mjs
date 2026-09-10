import assert from 'node:assert/strict';
import {
  advanceFlow,
  angularVelocity,
  coreRadius,
  createFlowSeeds,
  initialPlayback,
  singularityScales,
  strandEnvelope,
  traceFlow,
  velocityAt,
  MIN_VISCOSITY,
  MAX_VISCOSITY,
  DEFAULT_VISCOSITY,
  COLLAPSE_LIMIT,
  STRAIN,
} from '../lib/navier-stokes-flow.ts';
import { createSwirlGeometry } from '../lib/navier-stokes-model.ts';

const near = (actual, expected, epsilon = 1e-6) =>
  assert(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

// The analytic field is incompressible, finite on axis, and carries fluid
// inward radially and outward on BOTH sides of the dividing plane.
for (const nu of [MIN_VISCOSITY, DEFAULT_VISCOSITY, MAX_VISCOSITY]) {
  const origin = velocityAt(0, 0, 0, nu);
  assert(origin.every(Number.isFinite));
  near(Math.hypot(...origin), 0);
  near(angularVelocity(1e-8, nu), angularVelocity(0, nu));
  for (const point of [
    [1, 0.3, 2],
    [-0.7, -1, 0.5],
    [0.001, 0.2, 0.002],
  ]) {
    const v = velocityAt(...point, nu);
    assert(point[0] * v[0] + point[2] * v[2] < 0);
    assert(point[1] * v[1] > 0);
    const epsilon = 1e-5;
    let divergence = 0;
    for (let axis = 0; axis < 3; axis++) {
      const plus = [...point],
        minus = [...point];
      plus[axis] += epsilon;
      minus[axis] -= epsilon;
      divergence +=
        (velocityAt(...plus, nu)[axis] - velocityAt(...minus, nu)[axis]) /
        (2 * epsilon);
    }
    near(divergence, 0);
  }
  const seed = createFlowSeeds()[11];
  const { points, duration } = traceFlow(seed, nu, 1600);
  const dt = duration / 1600;
  for (let i = 2; i < points.length - 2; i += 41) {
    const p = points[i],
      before = points[i - 1],
      after = points[i + 1];
    const velocity = velocityAt(p.x, p.y, p.z, nu);
    for (const [axis, key] of ['x', 'y', 'z'].entries()) {
      const derivative =
        (-points[i + 2][key] +
          8 * after[key] -
          8 * before[key] +
          points[i - 2][key]) /
        (12 * dt);
      near(derivative, velocity[axis], 0.001);
    }
    near(
      Math.hypot(p.x, p.z) ** 2 * Math.abs(p.y),
      seed.radius ** 2 * Math.abs(seed.height),
    );
  }
  const started = performance.now();
  const { geometry } = createSwirlGeometry(nu);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert(
      attribute.array.every(Number.isFinite),
      `Invalid ${name} at viscosity ${nu}`,
    );
  }
  const count = geometry.getAttribute('position').count;
  assert(geometry.index.array.every((index) => index < count));
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < count; i += 97)
    near(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)), 1);
  console.log(
    `Geometry at viscosity ${nu}: ${count} vertices, ${(performance.now() - started).toFixed(0)} ms`,
  );
  geometry.dispose();
}
assert(coreRadius(MAX_VISCOSITY) > coreRadius(MIN_VISCOSITY));
assert(angularVelocity(0, MAX_VISCOSITY) < angularVelocity(0, MIN_VISCOSITY));
near(velocityAt(1, 0, 0, DEFAULT_VISCOSITY)[0], -STRAIN / 2);

// A material packet moves forward along the trajectory by dt/duration.
const envelope = strandEnvelope(0.4, 0, 6, 0.1);
near(strandEnvelope(0.5, 0.6, 6, 0.1), envelope);
near(strandEnvelope(0, 10, 6, 0.1), 0);
near(strandEnvelope(1, 10, 6, 0.1), 0);
assert.notEqual(strandEnvelope(0.4, 3, 6, 0.1), envelope);

// Playback and the accelerated collapse integrate consistently at common FPS.
for (const singularity of [false, true]) {
  const states = [];
  for (const fps of [30, 60, 144]) {
    let state = { ...initialPlayback(), singularity, speed: 1.5 };
    for (let i = 0; i < fps * 6; i++) state = advanceFlow(state, 1 / fps);
    states.push(state);
  }
  for (const state of states) {
    near(state.time, states[0].time);
    near(state.progress, states[0].progress);
  }
}
const paused = { ...initialPlayback(false), time: 3 };
assert.equal(advanceFlow(paused, 0.1), paused);
assert.equal(advanceFlow(initialPlayback(), Number.NaN).time, 0);
assert.equal(advanceFlow(initialPlayback(), -1).time, 0);
let collapse = { ...initialPlayback(), singularity: true, speed: 3 };
for (let i = 0; i < 600; i++) collapse = advanceFlow(collapse, 1 / 30);
near(collapse.progress, COLLAPSE_LIMIT);
assert.equal(collapse.playing, false);
assert.equal(advanceFlow(collapse, 0.1), collapse);
assert(Number.isFinite(collapse.time));
const initial = singularityScales(0),
  final = singularityScales(COLLAPSE_LIMIT);
near(initial.radial, 1);
assert(final.radial < final.axial && final.axial < 1);
assert(final.velocity > 1 && final.angular > final.velocity);
assert(Object.values(singularityScales(1)).every(Number.isFinite));
near(singularityScales(Number.NaN).radial, 1);
console.log(
  'PASS: finite geometry, incompressibility, trajectories, viscosity response, inward packet motion, pause, 30/60/144 FPS consistency, and bounded singularity.',
);
