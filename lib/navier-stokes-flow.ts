/**
 * An illustrative Burgers vortex, in dimensionless scene units.
 * u_r = -a r/2, u_y = a y,
 * u_theta = Gamma/(2 pi r) (1 - exp(-a r^2/(4 nu))).
 * This is a local analytic field, not a discretized Navier–Stokes solver.
 * References and the separate singularity schematic are documented in README.
 */
export const STRAIN = 0.65;
export const CIRCULATION = 22;
export const DEFAULT_VISCOSITY = 0.06;
export const MIN_VISCOSITY = 0.015;
export const MAX_VISCOSITY = 0.3;
export const COLLAPSE_LIMIT = 0.99;
export const COLLAPSE_SECONDS = 14;
export const SIMILARITY_H = 0.005;

export function bounded(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function coreRadius(viscosity: number) {
  return Math.sqrt(
    (4 * bounded(viscosity, MIN_VISCOSITY, MAX_VISCOSITY, DEFAULT_VISCOSITY)) /
      STRAIN,
  );
}

export function angularVelocity(radius: number, viscosity: number) {
  const coreSquared = coreRadius(viscosity) ** 2;
  // expm1 avoids cancellation near the axis; the analytic limit is finite.
  const rSquared = radius * radius;
  return rSquared < 1e-12
    ? CIRCULATION / (2 * Math.PI * coreSquared)
    : (CIRCULATION * -Math.expm1(-rSquared / coreSquared)) /
        (2 * Math.PI * rSquared);
}

export function velocityAt(x: number, y: number, z: number, viscosity: number) {
  const omega = angularVelocity(Math.hypot(x, z), viscosity);
  return [
    (-STRAIN * x) / 2 - omega * z,
    STRAIN * y,
    (-STRAIN * z) / 2 + omega * x,
  ] as const;
}

export type FlowSeed = {
  radius: number;
  height: number;
  angle: number;
  phase: number;
  width: number;
};
export type FlowPoint = { x: number; y: number; z: number; omega: number };
export type FlowPath = {
  points: FlowPoint[];
  duration: number;
  seed: FlowSeed;
};

export function createFlowSeeds(count = 84): FlowSeed[] {
  // A fixed low-discrepancy distribution keeps parameter comparisons repeatable.
  return Array.from({ length: count }, (_, i) => {
    const fraction = (i * 0.61803398875) % 1;
    const layer = i % 3;
    return {
      radius: [2.6, 1.65, 0.72][layer] + fraction * [0.8, 0.7, 0.6][layer],
      height: (i % 2 ? 1 : -1) * (0.025 + ((i * 0.381966) % 1) * 0.2),
      angle: i * 2.3999632297,
      phase: (i * 0.754877666) % 1,
      width: 0.014 + fraction * 0.022,
    };
  });
}

export function traceFlow(
  seed: FlowSeed,
  viscosity: number,
  segments = 240,
): FlowPath {
  const duration = Math.log(3.65 / Math.abs(seed.height)) / STRAIN;
  const dt = duration / segments;
  const points: FlowPoint[] = [];
  let angle = seed.angle;
  const omegaAt = (time: number) =>
    angularVelocity(seed.radius * Math.exp((-STRAIN * time) / 2), viscosity);
  for (let i = 0; i <= segments; i++) {
    const time = i * dt;
    if (i > 0) {
      // Simpson integration of theta'(t); r(t) and y(t) are analytic.
      angle +=
        (dt *
          (omegaAt(time - dt) + 4 * omegaAt(time - dt / 2) + omegaAt(time))) /
        6;
    }
    const radius = seed.radius * Math.exp((-STRAIN * time) / 2);
    points.push({
      x: radius * Math.cos(angle),
      y: seed.height * Math.exp(STRAIN * time),
      z: radius * Math.sin(angle),
      omega: omegaAt(time),
    });
  }
  return { points, duration, seed };
}

export function singularityScales(progress: number) {
  const tau = 1 - bounded(progress, 0, COLLAPSE_LIMIT, 0);
  return {
    radial: Math.sqrt(tau),
    axial: tau ** (0.5 - SIMILARITY_H),
    velocity: tau ** (-0.5 - SIMILARITY_H),
    angular: tau ** (-1 - SIMILARITY_H),
  };
}

export type FlowPlayback = {
  time: number;
  progress: number;
  singularity: boolean;
  playing: boolean;
  speed: number;
};

export function initialPlayback(playing = true): FlowPlayback {
  return { time: 0, progress: 0, singularity: false, playing, speed: 1 };
}

export function advanceFlow(state: FlowPlayback, delta: number): FlowPlayback {
  if (!state.playing || !Number.isFinite(delta) || delta <= 0) return state;
  const dt = Math.min(delta, 0.1) * bounded(state.speed, 0.25, 3, 1);
  if (!state.singularity) return { ...state, time: state.time + dt };
  const progress = Math.min(
    COLLAPSE_LIMIT,
    state.progress + dt / COLLAPSE_SECONDS,
  );
  // Exact integral of tau^(-1-h): no frame-rate dependence near the cutoff.
  const tau0 = 1 - state.progress;
  const tau1 = 1 - progress;
  const phaseDelta =
    (COLLAPSE_SECONDS * (tau1 ** -SIMILARITY_H - tau0 ** -SIMILARITY_H)) /
    SIMILARITY_H;
  return {
    ...state,
    time: state.time + phaseDelta,
    progress,
    playing: progress < COLLAPSE_LIMIT,
  };
}

/** Moving material packets travel in the same direction as the velocity field. */
export function strandEnvelope(
  age: number,
  time: number,
  duration: number,
  phase: number,
) {
  const q = (((age - time / duration + phase) % 1) + 1) % 1;
  const smooth = (a: number, b: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return (
    smooth(0, 0.13, q) *
    (1 - smooth(0.7, 0.96, q)) *
    smooth(0, 0.035, age) *
    (1 - smooth(0.94, 1, age))
  );
}
