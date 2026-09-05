export type WeaponForm = 'scythe' | 'rifle';
export const transformationPhase = (progress: number) =>
  progress === 0
    ? 'Scythe locked'
    : progress === 1
      ? 'Rifle locked'
      : progress < 0.19
        ? 'Folding blade tips'
        : progress < 0.42
          ? 'Nesting the blade sections'
          : progress < 0.7
            ? 'Rotating the main hinge'
            : progress < 0.94
              ? 'Retracting the shaft'
              : 'Locking the rifle';

/** A deterministic, frame-rate-independent timeline. Poses are sampled from a
 * single normalized value so seeking and reversing never accumulate drift. */
export function createTransformationPlayback(duration = 5.2) {
  let progress = 0,
    target = 1,
    playing = false,
    speed = 1;
  const finite = (n: number) => {
    if (!Number.isFinite(n)) throw new Error('Expected a finite number.');
    return n;
  };
  return {
    getState: () => ({
      progress,
      target,
      playing,
      speed,
      phase: transformationPhase(progress),
      form: progress === 1 ? ('rifle' as const) : ('scythe' as const),
    }),
    playTo(form: WeaponForm) {
      target = form === 'rifle' ? 1 : 0;
      playing = progress !== target;
    },
    togglePause() {
      if (progress === target) target = target === 1 ? 0 : 1;
      playing = !playing;
    },
    seek(value: number) {
      progress = Math.max(0, Math.min(1, finite(value)));
      playing = false;
      if (progress === 0) target = 1;
      if (progress === 1) target = 0;
    },
    setSpeed(value: number) {
      speed = Math.max(0.25, Math.min(2, finite(value)));
    },
    tick(seconds: number) {
      const dt = Math.max(0, finite(seconds));
      if (!playing) return false;
      const step = (dt * speed) / duration;
      progress =
        target > progress
          ? Math.min(target, progress + step)
          : Math.max(target, progress - step);
      if (progress === target) playing = false;
      return true;
    },
  };
}
