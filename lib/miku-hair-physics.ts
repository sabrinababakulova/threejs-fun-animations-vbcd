import * as T from 'three';

export type HairJoint = {
  bone: T.Bone;
  base: T.Quaternion;
  side: number;
  depth: number;
};

/** Camera orbit acts as a virtual turntable for the character's hair. */
export function createOrbitMotionTracker() {
  let previous: { azimuth: number; polar: number } | null = null;
  const velocity = new T.Vector3();
  return {
    sample(azimuth: number, polar: number, dt: number, interactive: boolean) {
      velocity.set(0, 0, 0);
      if (previous && interactive && dt > 0 && dt <= 0.1) {
        // OrbitControls wraps at +/- pi. A crossing is a small turn, not 360°.
        const yaw =
          Math.atan2(
            Math.sin(azimuth - previous.azimuth),
            Math.cos(azimuth - previous.azimuth),
          ) / dt;
        const pitch = (polar - previous.polar) / dt;
        // Invert the camera orbit: in the viewer's frame the body turns the
        // other way. Vertical drags rotate around the camera's horizontal axis.
        velocity.set(
          -pitch * Math.cos(azimuth),
          -yaw,
          pitch * Math.sin(azimuth),
        );
        velocity.clampLength(0, 7);
      }
      previous = { azimuth, polar };
      return velocity;
    },
    reset() {
      previous = null;
      velocity.set(0, 0, 0);
    },
  };
}

type Capsule = { start: T.Vector3; end: T.Vector3; radius: number };
const STEP = 1 / 240;
const UP = new T.Vector3(0, 1, 0);
const ZERO = new T.Vector3();
const SEGMENT_SAMPLES = [0.25, 0.5, 0.75];

/** Fixed-step Verlet spring bones with inertial forces and body capsules.
 * The model itself remains posed. Only the twelve joints below the two clips
 * rotate; joints, mesh scale, body bones and clip transforms are never moved.
 */
export function createMikuHairPhysics(
  root: T.Group,
  hair: HairJoint[],
  bones: Map<string, T.Bone>,
) {
  root.updateMatrixWorld(true);
  const colliders: Capsule[] = [];
  const point = (name: string) =>
    bones.get(name)!.getWorldPosition(new T.Vector3());
  const capsule = (start: T.Vector3, end: T.Vector3, radius: number) =>
    colliders.push({ start, end, radius });
  capsule(new T.Vector3(0, 1.12, -0.015), new T.Vector3(0, 1.49, -0.015), 0.16);
  capsule(new T.Vector3(0, 1.78, 0), new T.Vector3(0, 1.88, 0), 0.15);
  capsule(new T.Vector3(0, 1.04, 0), new T.Vector3(0, 1.1, 0), 0.21);
  for (const side of ['左', '右']) {
    capsule(point(`${side}腕`), point(`${side}ひじ`), 0.068);
    capsule(point(`${side}ひじ`), point(`${side}手首`), 0.078);
    capsule(point(`${side}足`), point(`${side}ひざ`), 0.075);
    capsule(point(`${side}ひざ`), point(`${side}足首`), 0.055);
  }
  const particles = hair
    .filter((j) => j.depth > 0)
    .sort((a, b) => a.depth - b.depth || a.side - b.side)
    .map((joint) => {
      const next = hair.find(
        (j) => j.side === joint.side && j.depth === joint.depth + 1,
      );
      const origin = joint.bone.getWorldPosition(new T.Vector3());
      const tail = next
        ? next.bone.getWorldPosition(new T.Vector3())
        : origin
            .clone()
            .sub(joint.bone.parent!.getWorldPosition(new T.Vector3()))
            .normalize()
            .multiplyScalar(0.09)
            .add(origin);
      const restAxis = tail
        .clone()
        .sub(origin)
        .transformDirection(joint.bone.matrixWorld.clone().invert());
      return {
        ...joint,
        tail,
        previous: tail.clone(),
        restAxis,
        length: origin.distanceTo(tail),
        radius: 0.075 - joint.depth * 0.004,
      };
    });
  let accumulator = 0,
    time = 0;
  const angularVelocity = new T.Vector3(),
    previousAngularVelocity = new T.Vector3(),
    angularAcceleration = new T.Vector3();
  const pivot = new T.Vector3(0, 1.02, 0);
  const origin = new T.Vector3(),
    restDirection = new T.Vector3(),
    velocity = new T.Vector3(),
    acceleration = new T.Vector3();
  const radial = new T.Vector3(),
    cross = new T.Vector3(),
    force = new T.Vector3(),
    candidate = new T.Vector3();
  const segment = new T.Vector3(),
    nearest = new T.Vector3(),
    normal = new T.Vector3(),
    direction = new T.Vector3();
  const probe = new T.Vector3(),
    unprojected = new T.Vector3();
  const parentRotation = new T.Quaternion(),
    restRotation = new T.Quaternion(),
    swing = new T.Quaternion();
  const identityRotation = new T.Quaternion();
  function projectBody(tail: T.Vector3, radius: number) {
    for (const collider of colliders) {
      segment.subVectors(collider.end, collider.start);
      const along = T.MathUtils.clamp(
        nearest.subVectors(tail, collider.start).dot(segment) /
          Math.max(segment.lengthSq(), 1e-8),
        0,
        1,
      );
      nearest.copy(collider.start).addScaledVector(segment, along);
      normal.subVectors(tail, nearest);
      const distance = normal.length(),
        clearance = radius + collider.radius;
      if (distance < clearance) {
        if (distance < 1e-8) normal.set(0, 0, -1);
        else normal.divideScalar(distance);
        tail.copy(nearest).addScaledVector(normal, clearance);
      }
    }
    tail.y = Math.max(tail.y, radius + 0.012);
  }
  function step(wind: number, input: T.Vector3) {
    time += STEP;
    previousAngularVelocity.copy(angularVelocity);
    angularVelocity.lerp(input, 1 - Math.exp(-18 * STEP));
    angularAcceleration
      .subVectors(angularVelocity, previousAngularVelocity)
      .divideScalar(STEP)
      .clampLength(0, 55);
    for (const particle of particles) {
      const {
        bone,
        base,
        depth,
        side,
        tail,
        previous,
        restAxis,
        length,
        radius,
      } = particle;
      bone.parent!.getWorldQuaternion(parentRotation);
      bone.getWorldPosition(origin);
      restRotation.copy(parentRotation).multiply(base);
      restDirection.copy(restAxis).applyQuaternion(restRotation).normalize();
      velocity.subVectors(tail, previous).multiplyScalar(Math.exp(-8 * STEP));
      // Elastic stiffness preserves the authored silhouette but allows the
      // heavier ends to lag. Gravity and air resistance act at every step.
      acceleration
        .copy(origin)
        .addScaledVector(restDirection, length)
        .sub(tail)
        .multiplyScalar(95 - depth * 8);
      acceleration.addScaledVector(UP, -9.81);
      acceleration.x +=
        wind *
        (0.9 * Math.sin(time * 1.15 - depth * 0.48 + side * 0.6) +
          0.4 * Math.sin(time * 0.53));
      acceleration.z +=
        wind * 0.65 * Math.sin(time * 0.8 - depth * 0.45 + side);
      radial.subVectors(tail, pivot);
      // Euler, centrifugal and Coriolis forces in the virtual body's frame.
      force.crossVectors(angularAcceleration, radial).negate();
      cross.crossVectors(angularVelocity, radial);
      force.sub(cross.crossVectors(angularVelocity, cross));
      cross.crossVectors(
        angularVelocity,
        candidate.copy(velocity).divideScalar(STEP),
      );
      force.addScaledVector(cross, -2);
      acceleration.addScaledVector(force.clampLength(0, 30), 0.72);
      candidate
        .copy(tail)
        .add(velocity)
        .addScaledVector(acceleration, STEP * STEP);
      previous.copy(tail);
      // Alternating length, bend and collision constraints keep the chain
      // stable under abrupt reversals. Wider cones toward the ends allow flare.
      for (let iteration = 0; iteration < 10; iteration++) {
        direction.subVectors(candidate, origin).normalize();
        const angle = restDirection.angleTo(direction),
          limit = 0.65 + depth * 0.055;
        if (angle > limit) {
          swing.setFromUnitVectors(restDirection, direction);
          swing.slerp(identityRotation, 1 - limit / angle);
          direction.copy(restDirection).applyQuaternion(swing);
        }
        // Prevent a fast spin folding long locks back through themselves. The
        // ends can fan nearly horizontal, while keeping their hanging shape.
        if (direction.y > -0.07) {
          direction.y = -0.07;
          direction.normalize();
        }
        candidate.copy(origin).addScaledVector(direction, length);
        // Endpoints alone miss a long segment passing through a sleeve/torso.
        for (const fraction of SEGMENT_SAMPLES) {
          probe.lerpVectors(origin, candidate, fraction);
          unprojected.copy(probe);
          projectBody(probe, radius);
          candidate.addScaledVector(probe.sub(unprojected), 1 / fraction);
        }
        projectBody(candidate, radius);
      }
      direction.subVectors(candidate, origin).normalize();
      tail.copy(origin).addScaledVector(direction, length);
      // Bring the desired tail direction into the parent's frame. A swing
      // quaternion preserves the model's authored rest roll and strand shape.
      direction.applyQuaternion(parentRotation.invert());
      candidate.copy(restAxis).applyQuaternion(base);
      swing.setFromUnitVectors(candidate, direction);
      bone.quaternion.copy(swing).multiply(base);
      bone.updateWorldMatrix(false, true);
    }
  }
  return {
    advance(dt: number, wind: number, motion: T.Vector3 = ZERO) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      accumulator += Math.min(dt, 0.1);
      while (accumulator + 1e-9 >= STEP) {
        step(T.MathUtils.clamp(wind, 0, 1.6), motion);
        accumulator -= STEP;
      }
    },
    reset() {
      accumulator = 0;
      time = 0;
      angularVelocity.set(0, 0, 0);
      hair.forEach((j) => j.bone.quaternion.copy(j.base));
      root.updateMatrixWorld(true);
      for (const particle of particles) {
        particle.bone.getWorldPosition(origin);
        particle.bone.getWorldQuaternion(restRotation);
        particle.tail
          .copy(particle.restAxis)
          .applyQuaternion(restRotation)
          .multiplyScalar(particle.length)
          .add(origin);
        particle.previous.copy(particle.tail);
      }
    },
    // Snapshot for geometric regression checks; no mutable solver state escapes.
    getState() {
      return particles.map((p) => ({
        side: p.side,
        depth: p.depth,
        tail: p.tail.clone(),
        length: p.length,
        radius: p.radius,
      }));
    },
  };
}
