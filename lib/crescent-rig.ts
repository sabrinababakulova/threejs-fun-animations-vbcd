import * as THREE from 'three';
import type { PartName } from './crescent-rose';

export const TRANSFORM_DURATION = 2.0;
export const smoothStage = (p: number, start: number, end: number) => {
  const t = THREE.MathUtils.clamp((p - start) / (end - start), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const profilePoint = (u: number, v: number, z = 0) =>
  new THREE.Vector3(-(v - 360) / 125, (u - 1050) / 125, z);

/** Visual, reference-inspired mechanism. All folds preserve rigid geometry.
 * Nested pivot groups are placed on the visible hinge centers; sliders retain
 * their full length while entering larger housings. No mesh swaps or scaling.
 */
export function createCrescentRig(
  root: THREE.Group,
  groups: Record<PartName, THREE.Group>,
) {
  root.updateMatrixWorld(true);
  const joint = (
    name: string,
    parent: THREE.Object3D,
    at: THREE.Vector3,
    members: THREE.Object3D[] = [],
  ) => {
    const j = new THREE.Group();
    j.name = name;
    // Profile positions are root-local, even for nested mechanisms.
    j.position.copy(parent.worldToLocal(root.localToWorld(at.clone())));
    parent.add(j);
    root.updateMatrixWorld(true);
    for (const member of members) j.attach(member);
    return j;
  };
  const center = (m: THREE.Object3D) => {
    const p = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    root.worldToLocal(p);
    return { u: p.y * 125 + 1050, v: 360 - p.x * 125 };
  };
  const headCarriage = joint('CR_HeadCarriage', root, new THREE.Vector3(), [
    groups.blade,
    groups.counterblade,
  ]);
  const bladeMeshes = [...groups.blade.children];
  const fixedNames = [
    'Angular shoulder bracket',
    'Shoulder ',
    'Head breech block',
    'Head muzzle',
    'Breech cap',
    'Main folding pivot',
  ];
  const mainMembers = bladeMeshes.filter((m) => {
    if (fixedNames.some((name) => m.name.startsWith(name))) return false;
    const c = center(m);
    // The eight fasteners in the main hub stay on the stationary bearing.
    if (Math.hypot(c.u - 1684, c.v - 403) < 31) return false;
    return true;
  });
  const mainFold = joint(
    'CR_MainFold',
    groups.blade,
    profilePoint(1684, 403),
    mainMembers,
  );
  const lowerNames = [
    'Lower articulated',
    'Lower arm',
    'Lower silver',
    'Lower sharpened',
    'Crescent terminal',
    'Terminal',
    'Cutting face over terminal',
    'Silver segment seam',
  ];
  const lowerMembers = [...mainFold.children].filter((m) => {
    if (lowerNames.some((name) => m.name.startsWith(name))) return true;
    const c = center(m);
    return c.v > 810;
  });
  const lowerFold = joint(
    'CR_LowerFold',
    mainFold,
    profilePoint(1624, 742),
    lowerMembers,
  );
  const tipFold = joint(
    'CR_TipFold',
    lowerFold,
    profilePoint(1470, 881),
    [...lowerFold.children].filter(
      (m) =>
        m.name.startsWith('Crescent terminal') ||
        m.name.startsWith('Terminal polished'),
    ),
  );
  const upperEdgeSlide = joint(
    'CR_UpperEdgeSlide',
    mainFold,
    new THREE.Vector3(),
    [...mainFold.children].filter((m) =>
      /^(Upper silver|Upper sharpened)/.test(m.name),
    ),
  );
  const spineSlide = joint(
    'CR_SpineSlide',
    mainFold,
    new THREE.Vector3(),
    [...mainFold.children].filter((m) =>
      /^(Swept black blade spine|Blade spine cooling slot)/.test(m.name),
    ),
  );
  const heelSlide = joint(
    'CR_HeelSlide',
    mainFold,
    new THREE.Vector3(),
    [...mainFold.children].filter((m) => m.name === 'Inner blade heel'),
  );
  const lowerEdgeSlide = joint(
    'CR_LowerEdgeSlide',
    lowerFold,
    new THREE.Vector3(),
    [...lowerFold.children].filter((m) =>
      /^(Lower silver|Lower sharpened|Cutting face over terminal)/.test(m.name),
    ),
  );
  const counterFold = joint(
    'CR_CounterFold',
    groups.counterblade,
    profilePoint(1674, 359),
    [...groups.counterblade.children],
  );
  const counterTip = joint(
    'CR_CounterTip',
    counterFold,
    profilePoint(1631, 193),
    [...counterFold.children].filter((m) => {
      if (m.name.startsWith('Upper extension')) return false;
      const c = center(m);
      return c.v < 260;
    }),
  );
  const counterEdgeSlide = joint(
    'CR_CounterEdgeSlide',
    counterTip,
    new THREE.Vector3(),
    [...counterTip.children].filter((m) =>
      /^(Counterblade cutting body|Counterblade sharpened edge)/.test(m.name),
    ),
  );
  const barrelSlide = joint(
    'CR_BarrelSlide',
    groups.shaft,
    new THREE.Vector3(),
    [...groups.shaft.children].filter((m) =>
      /Upper black rifle barrel|Inner barrel liner|Barrel cooling inset/.test(
        m.name,
      ),
    ),
  );
  const muzzleSlide = joint(
    'CR_MuzzleSlide',
    groups.shaft,
    new THREE.Vector3(),
    [...groups.shaft.children].filter((m) =>
      /Lower telescoping shaft|Shaft bright sliding edge/.test(m.name),
    ),
  );
  muzzleSlide.attach(groups.pommel);
  const stockFold = joint(
    'CR_StockFold',
    groups.pommel,
    profilePoint(555, 363),
    [...groups.pommel.children],
  );
  const stockTip = joint(
    'CR_StockTip',
    stockFold,
    profilePoint(438, 362),
    [...stockFold.children].filter((m) => m.name.startsWith('Stock tip')),
  );
  const stockToeSlide = joint(
    'CR_StockToeSlide',
    stockFold,
    new THREE.Vector3(),
    [...stockFold.children].filter((m) =>
      /^(Upper pommel edge|Lower pommel edge|Pommel blade separation)/.test(
        m.name,
      ),
    ),
  );
  const opticSlide = joint(
    'CR_OpticSlide',
    groups.receiver,
    new THREE.Vector3(),
    [...groups.receiver.children].filter((m) => /^(Scope|Optic)/.test(m.name)),
  );
  const boltSlide = joint(
    'CR_BoltSlide',
    groups.receiver,
    new THREE.Vector3(),
    [...groups.receiver.children].filter((m) =>
      /^(Bolt action handle|Bolt handle knob|Ejection port chamber)/.test(
        m.name,
      ),
    ),
  );
  const joints = {
    headCarriage,
    mainFold,
    lowerFold,
    tipFold,
    counterFold,
    counterTip,
    barrelSlide,
    muzzleSlide,
    opticSlide,
    boltSlide,
    upperEdgeSlide,
    lowerEdgeSlide,
    counterEdgeSlide,
    stockFold,
    stockTip,
    stockToeSlide,
    spineSlide,
    heelSlide,
  };
  const rest = new Map<
    THREE.Object3D,
    { position: THREE.Vector3; quaternion: THREE.Quaternion }
  >();
  for (const object of [...Object.values(joints), ...Object.values(groups)])
    rest.set(object, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    });
  root.name = 'Crescent_Rose';
  let progress = 0,
    separation = 0,
    boltProgress = 0;
  const explodeDirections: Record<PartName, THREE.Vector3> = {
    blade: new THREE.Vector3(-1.1, 0.7, 0.3),
    counterblade: new THREE.Vector3(0.7, 1.4, -0.2),
    receiver: new THREE.Vector3(0.5, 0, 1.2),
    shaft: new THREE.Vector3(0, -0.6, -0.6),
    pommel: new THREE.Vector3(0, -1.4, 0.1),
  };
  const apply = () => {
    for (const [object, base] of rest) {
      object.position.copy(base.position);
      object.quaternion.copy(base.quaternion);
    }
    const s = (a: number, b: number) => smoothStage(progress, a, b);
    // Small tips close first; the two long blade sections then fold on separate
    // axial layers, leaving space for the silver edges throughout the swing.
    spineSlide.position.y -= 0.37 * s(0.05, 0.24);
    heelSlide.position.y += 0.55 * s(0.05, 0.24);
    upperEdgeSlide.position.y += 0.62 * s(0.01, 0.19);
    lowerEdgeSlide.position.y += 0.32 * s(0.02, 0.2);
    lowerEdgeSlide.position.x -= 0.2 * s(0.02, 0.2);
    counterEdgeSlide.position.y += 1.08 * s(0.02, 0.2);
    counterEdgeSlide.position.x += 0.16 * s(0.02, 0.2);
    tipFold.position.z += 0.264 * s(0.02, 0.12);
    tipFold.rotation.z = THREE.MathUtils.degToRad(174) * s(0.08, 0.29);
    lowerFold.position.z -= 0.924 * s(0.05, 0.18);
    lowerFold.rotation.z = THREE.MathUtils.degToRad(158) * s(0.19, 0.48);
    counterTip.position.z -= 0.248 * s(0.03, 0.12);
    counterTip.rotation.z = THREE.MathUtils.degToRad(79) * s(0.09, 0.3);
    counterFold.position.z -= 0.71 * s(0.12, 0.24);
    counterFold.rotation.z = THREE.MathUtils.degToRad(-91) * s(0.28, 0.52);
    mainFold.position.z += 0.743 * s(0.26, 0.39);
    mainFold.rotation.z = THREE.MathUtils.degToRad(79.2) * s(0.42, 0.7);
    // The head and barrel share a carriage stroke. The bore remains continuous
    // through the receiver; the front segment is sheathed, never shortened.
    headCarriage.position.y -= 2.32 * s(0.66, 0.88);
    barrelSlide.position.y -= 2.32 * s(0.66, 0.88);
    muzzleSlide.position.y += 1 * s(0.71, 0.92);
    stockToeSlide.position.y += 0.28 * s(0.06, 0.3);
    stockTip.position.z += 0.27 * s(0.01, 0.13);
    stockTip.rotation.z = Math.PI * s(0.08, 0.34);
    stockFold.rotation.z = (-Math.PI / 2) * s(0.48, 0.78);
    root.rotation.z = THREE.MathUtils.lerp(-0.18, Math.PI / 2, s(0.38, 0.96));
    // A visible straight-pull action: retract, pause open, then return forward.
    const pull =
      smoothStage(boltProgress, 0.05, 0.4) -
      smoothStage(boltProgress, 0.58, 0.94);
    boltSlide.position.y += 0.3 * pull;
    for (const name of Object.keys(groups) as PartName[])
      groups[name].position.addScaledVector(
        explodeDirections[name],
        separation,
      );
    root.updateMatrixWorld(true);
  };
  const checked = (value: number) => {
    if (!Number.isFinite(value)) throw new Error('Progress must be finite.');
    return THREE.MathUtils.clamp(value, 0, 1);
  };
  apply();
  return {
    joints,
    setTransformation: (value: number) => {
      progress = checked(value);
      apply();
    },
    setExplode: (value: number) => {
      separation = checked(value);
      apply();
    },
    setBoltProgress: (value: number) => {
      boltProgress = checked(value);
      apply();
    },
    getProgress: () => progress,
    createAnimationClip: () => {
      const saved = progress,
        savedSeparation = separation,
        savedBolt = boltProgress;
      const objects = [root, ...Object.values(joints)];
      const times: number[] = [];
      const values = objects.map(() => ({
        positions: [] as number[],
        quaternions: [] as number[],
      }));
      separation = 0;
      boltProgress = 0;
      for (let i = 0; i <= 156; i++) {
        progress = i / 156;
        apply();
        times.push(progress * TRANSFORM_DURATION);
        objects.forEach((o, j) => {
          o.position.toArray(values[j].positions, i * 3);
          o.quaternion.toArray(values[j].quaternions, i * 4);
        });
      }
      progress = saved;
      separation = savedSeparation;
      boltProgress = savedBolt;
      apply();
      return new THREE.AnimationClip(
        'Scythe to sniper rifle',
        TRANSFORM_DURATION,
        objects.flatMap((o, i) => [
          new THREE.VectorKeyframeTrack(
            o.name + '.position',
            times,
            values[i].positions,
          ),
          new THREE.QuaternionKeyframeTrack(
            o.name + '.quaternion',
            times,
            values[i].quaternions,
          ),
        ]),
      );
    },
  };
}
