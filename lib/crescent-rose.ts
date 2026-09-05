import * as THREE from 'three';
import { createCrescentRig } from './crescent-rig.ts';

// Profile coordinates follow the original Crescent Rose production render:
// https://rwby.fandom.com/wiki/Crescent_Rose/Image_Gallery
// Render pixels are a proportional modeling guide, not canonical dimensions.
const SCALE = 125;
const point = (u: number, v: number) =>
  new THREE.Vector2(-(v - 360) / SCALE, (u - 1050) / SCALE);
type P = [number, number];
type PathCommand =
  | ['M' | 'L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number];
export type PartName =
  | 'blade'
  | 'counterblade'
  | 'receiver'
  | 'shaft'
  | 'pommel';
export type Finish = 'studio' | 'original' | 'wireframe';

export function createCrescentRose() {
  const root = new THREE.Group();
  root.name = 'Crescent Rose — extended scythe';
  const red = new THREE.MeshPhysicalMaterial({
    color: '#b9152a',
    metalness: 0.48,
    roughness: 0.31,
    clearcoat: 0.32,
    clearcoatRoughness: 0.28,
  });
  const deepRed = new THREE.MeshStandardMaterial({
    color: '#700e19',
    metalness: 0.55,
    roughness: 0.4,
  });
  const redEdge = new THREE.MeshStandardMaterial({
    color: '#d02b38',
    metalness: 0.48,
    roughness: 0.3,
  });
  const black = new THREE.MeshStandardMaterial({
    color: '#15181c',
    metalness: 0.65,
    roughness: 0.32,
  });
  const recess = new THREE.MeshStandardMaterial({
    color: '#080b10',
    metalness: 0.25,
    roughness: 0.65,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: '#b7c2cb',
    metalness: 0.88,
    roughness: 0.25,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: '#eef2f4',
    metalness: 0.85,
    roughness: 0.2,
  });
  const gunmetal = new THREE.MeshStandardMaterial({
    color: '#41474f',
    metalness: 0.85,
    roughness: 0.34,
  });
  const grip = new THREE.MeshStandardMaterial({
    color: '#202126',
    metalness: 0.08,
    roughness: 0.82,
  });
  const lens = new THREE.MeshPhysicalMaterial({
    color: '#314b4b',
    metalness: 0.78,
    roughness: 0.08,
    clearcoat: 1,
  });
  const materials = [
    red,
    deepRed,
    redEdge,
    black,
    recess,
    steel,
    edge,
    gunmetal,
    grip,
    lens,
  ];
  const originals = materials.map((m) => ({
    color: m.color.clone(),
    metalness: m.metalness,
    roughness: m.roughness,
  }));
  const groups = Object.fromEntries(
    (
      ['blade', 'counterblade', 'receiver', 'shaft', 'pommel'] as PartName[]
    ).map((name) => {
      const group = new THREE.Group();
      group.name = name;
      root.add(group);
      return [name, group];
    }),
  ) as Record<PartName, THREE.Group>;
  let active = groups.blade;
  const mesh = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
  ) => {
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    active.add(m);
    return m;
  };
  const makeShape = (commands: PathCommand[]) => {
    const s = new THREE.Shape();
    for (const c of commands) {
      const p = point(c[1], c[2]);
      if (c[0] === 'M') s.moveTo(p.x, p.y);
      if (c[0] === 'L') s.lineTo(p.x, p.y);
      if (c[0] === 'Q') {
        const e = point(c[3], c[4]);
        s.quadraticCurveTo(p.x, p.y, e.x, e.y);
      }
      if (c[0] === 'C') {
        const q = point(c[3], c[4]);
        const e = point(c[5], c[6]);
        s.bezierCurveTo(p.x, p.y, q.x, q.y, e.x, e.y);
      }
    }
    s.closePath();
    return s;
  };
  const plate = (
    name: string,
    path: P[] | PathCommand[],
    thickness: number,
    material: THREE.Material,
    z = 0,
    bevel = 0.012,
  ) => {
    const commands =
      typeof path[0][0] === 'number'
        ? (path as P[]).map((p, i) => [i ? 'L' : 'M', ...p] as PathCommand)
        : (path as PathCommand[]);
    const geometry = new THREE.ExtrudeGeometry(makeShape(commands), {
      depth: thickness,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 24,
      steps: 1,
    });
    geometry.translate(0, 0, z - thickness / 2);
    return mesh(geometry, material, name);
  };
  const panel = (
    name: string,
    p: P[] | PathCommand[],
    z: number,
    material: THREE.Material = red,
    thickness = 0.038,
  ) => {
    plate(name + ' / front', p, thickness, material, z);
    plate(name + ' / back', p, thickness, material, -z);
  };
  const box = (
    name: string,
    u: number,
    v: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    z = 0,
  ) => {
    const p = point(u, v);
    const m = mesh(
      new THREE.BoxGeometry(height / SCALE, width / SCALE, depth),
      material,
      name,
    );
    m.position.set(p.x, p.y, z);
    return m;
  };
  const disk = (
    name: string,
    u: number,
    v: number,
    radius: number,
    depth: number,
    material: THREE.Material,
    z = 0,
    segments = 48,
  ) => {
    const p = point(u, v);
    const m = mesh(
      new THREE.CylinderGeometry(
        radius / SCALE,
        radius / SCALE,
        depth,
        segments,
      ),
      material,
      name,
    );
    m.rotation.x = Math.PI / 2;
    m.position.set(p.x, p.y, z);
    return m;
  };
  const bolt = (u: number, v: number, z: number, r = 3.3) => {
    for (const sign of [-1, 1]) {
      disk('Recessed fastener', u, v, r + 1.5, 0.012, recess, sign * z);
      disk('Hex bolt', u, v, r, 0.018, gunmetal, sign * (z + 0.01), 6);
      box('Bolt slot', u, v, r * 1.1, 0.7, 0.008, recess, sign * (z + 0.023));
    }
  };
  const tube = (
    name: string,
    start: P,
    end: P,
    radius: number,
    material: THREE.Material,
    z = 0,
    segments = 16,
  ) => {
    const a = point(...start);
    const b = point(...end);
    const av = new THREE.Vector3(a.x, a.y, z),
      bv = new THREE.Vector3(b.x, b.y, z);
    const m = mesh(
      new THREE.CylinderGeometry(
        radius / SCALE,
        radius / SCALE,
        av.distanceTo(bv),
        segments,
      ),
      material,
      name,
    );
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bv.sub(av).normalize(),
    );
    return m;
  };

  // The long crescent is split into its black back, silver cutting face,
  // red load-bearing shell, articulated lower arm and hooked tip.
  plate(
    'Swept black blade spine',
    [
      ['M', 1697, 442],
      ['L', 1770, 411],
      ['L', 1778, 399],
      ['C', 1780, 527, 1730, 653, 1653, 769],
      ['L', 1588, 738],
      ['L', 1622, 615],
      ['L', 1646, 472],
    ],
    0.15,
    black,
  );
  plate(
    'Upper silver cutting face',
    [
      ['M', 1578, 486],
      ['L', 1643, 493],
      ['L', 1632, 618],
      ['L', 1601, 715],
      ['L', 1545, 700],
      ['Q', 1575, 616, 1578, 516],
    ],
    0.072,
    steel,
  );
  plate(
    'Lower silver cutting face',
    [
      ['M', 1545, 700],
      ['L', 1601, 715],
      ['Q', 1550, 808, 1480, 879],
      ['L', 1457, 843],
      ['L', 1503, 764],
      ['Q', 1528, 735, 1545, 700],
    ],
    0.072,
    steel,
  );
  panel(
    'Upper sharpened inner bevel',
    [
      ['M', 1578, 516],
      ['L', 1585, 518],
      ['Q', 1580, 632, 1550, 702],
      ['L', 1545, 700],
      ['Q', 1575, 616, 1578, 516],
    ],
    0.045,
    edge,
    0.014,
  );
  panel(
    'Lower sharpened inner bevel',
    [
      ['M', 1545, 700],
      ['L', 1550, 702],
      ['Q', 1534, 740, 1510, 767],
      ['L', 1463, 844],
      ['L', 1480, 870],
      ['L', 1480, 879],
      ['L', 1457, 843],
      ['L', 1503, 764],
      ['Q', 1528, 735, 1545, 700],
    ],
    0.045,
    edge,
    0.014,
  );
  plate(
    'Blade root chassis',
    [
      [1655, 355],
      [1698, 355],
      [1730, 391],
      [1715, 584],
      [1703, 629],
      [1660, 754],
      [1605, 739],
      [1586, 716],
      [1597, 648],
      [1620, 635],
      [1646, 459],
    ],
    0.29,
    black,
  );
  panel(
    'Upper red blade armor',
    [
      [1659, 359],
      [1697, 359],
      [1726, 394],
      [1710, 588],
      [1700, 625],
      [1655, 749],
      [1607, 734],
      [1591, 714],
      [1602, 652],
      [1625, 637],
      [1650, 461],
    ],
    0.174,
  );
  panel(
    'Recessed blade spine channel',
    [
      [1684, 431],
      [1694, 430],
      [1667, 598],
      [1701, 620],
      [1698, 631],
      [1657, 605],
    ],
    0.2,
    recess,
    0.012,
  );
  panel(
    'Inset upper armor face',
    [
      [1700, 434],
      [1718, 412],
      [1703, 585],
      [1699, 611],
      [1673, 595],
    ],
    0.207,
    redEdge,
    0.018,
  );
  plate(
    'Lower articulated red arm',
    [
      ['M', 1609, 731],
      ['L', 1654, 751],
      ['Q', 1600, 845, 1528, 900],
      ['L', 1491, 909],
      ['L', 1480, 892],
      ['Q', 1557, 817, 1609, 731],
    ],
    0.25,
    deepRed,
  );
  panel(
    'Lower arm outer cover',
    [
      ['M', 1619, 745],
      ['L', 1647, 757],
      ['Q', 1590, 849, 1526, 895],
      ['L', 1496, 901],
      ['L', 1490, 891],
      ['Q', 1567, 817, 1619, 745],
    ],
    0.145,
  );
  panel(
    'Lower arm inset line',
    [
      ['M', 1618, 753],
      ['L', 1624, 756],
      ['Q', 1587, 824, 1517, 884],
      ['L', 1513, 880],
      ['Q', 1580, 817, 1618, 753],
    ],
    0.176,
    recess,
    0.014,
  );
  plate(
    'Crescent terminal hook',
    [
      ['M', 1457, 836],
      ['Q', 1442, 842, 1434, 857],
      ['L', 1428, 880],
      ['Q', 1377, 929, 1245, 978],
      ['Q', 1397, 986, 1510, 925],
      ['L', 1488, 889],
      ['L', 1480, 865],
    ],
    0.065,
    black,
  );
  panel(
    'Terminal polished bevel',
    [
      ['M', 1428, 880],
      ['Q', 1377, 929, 1245, 978],
      ['L', 1263, 975],
      ['Q', 1378, 935, 1434, 890],
      ['L', 1441, 873],
      ['L', 1437, 866],
    ],
    0.041,
    edge,
    0.012,
  );
  disk('Terminal hinge ring', 1470, 881, 40, 0.135, steel);
  disk('Terminal hinge black inset', 1470, 881, 34, 0.18, black);
  disk('Terminal hinge red inner ring', 1470, 881, 28, 0.19, deepRed);
  disk('Terminal hinge core', 1470, 881, 22, 0.198, recess);
  // Covers intersect the pivot exactly as the folding assembly does in the reference.
  panel(
    'Cutting face over terminal hinge',
    [
      [1503, 766],
      [1543, 796],
      [1480, 876],
      [1460, 848],
    ],
    0.12,
    steel,
    0.035,
  );
  plate(
    'Angular shoulder bracket',
    [
      [1568, 335],
      [1593, 322],
      [1643, 377],
      [1640, 488],
      [1618, 486],
      [1557, 395],
    ],
    0.43,
    black,
  );
  panel(
    'Shoulder red shell',
    [
      [1572, 338],
      [1592, 326],
      [1638, 378],
      [1635, 478],
      [1622, 479],
      [1562, 394],
    ],
    0.244,
  );
  plate(
    'Inner blade heel',
    [
      [1567, 443],
      [1604, 443],
      [1620, 486],
      [1607, 498],
      [1585, 486],
      [1580, 517],
      [1553, 508],
      [1559, 472],
      [1564, 472],
    ],
    0.22,
    black,
  );
  box('Head breech block', 1720, 355, 58, 64, 0.39, black);
  box('Breech cap', 1745, 355, 7, 58, 0.42, gunmetal);
  disk('Main folding pivot seat', 1684, 403, 33, 0.48, black);
  disk('Main folding pivot red ring', 1684, 403, 27, 0.53, deepRed);
  disk('Main folding pivot hub', 1684, 403, 19, 0.56, gunmetal);
  disk('Main folding pivot center', 1684, 403, 10, 0.59, red);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    bolt(1684 + 22 * Math.cos(a), 403 + 22 * Math.sin(a), 0.28, 2);
  }
  for (const [u, v] of [
    [1615, 668],
    [1632, 691],
    [1608, 705],
  ] as P[]) {
    disk('Three-hole blade detail', u, v, 6, 0.385, recess);
    disk('Recess bottom', u, v, 3.8, 0.39, black);
  }
  for (const p of [
    [1667, 370],
    [1708, 405],
    [1610, 723],
    [1638, 746],
    [1524, 885],
    [1711, 489],
  ] as P[])
    bolt(...p, 0.21, 2.5);
  panel(
    'Silver segment seam',
    [
      [1545, 698],
      [1588, 719],
      [1586, 722],
      [1544, 702],
    ],
    0.055,
    gunmetal,
    0.008,
  );

  active = groups.counterblade;
  plate(
    'Upper extension spine',
    [
      [1595, 179],
      [1636, 184],
      [1681, 321],
      [1690, 365],
      [1660, 373],
      [1646, 332],
      [1621, 302],
    ],
    0.32,
    black,
  );
  panel(
    'Upper extension red rail',
    [
      [1627, 194],
      [1658, 203],
      [1690, 327],
      [1688, 347],
      [1670, 348],
    ],
    0.18,
  );
  plate(
    'Counterblade cutting body',
    [
      ['M', 1612, 138],
      ['Q', 1511, 155, 1450, 229],
      ['Q', 1532, 195, 1602, 196],
      ['L', 1639, 210],
    ],
    0.064,
    black,
  );
  panel(
    'Counterblade sharpened edge',
    [
      ['M', 1450, 229],
      ['Q', 1532, 195, 1602, 196],
      ['L', 1616, 203],
      ['L', 1601, 186],
      ['Q', 1536, 185, 1450, 229],
    ],
    0.043,
    steel,
    0.014,
  );
  plate(
    'Counterblade red cap',
    [
      [1611, 135],
      [1732, 162],
      [1732, 213],
      [1629, 192],
      [1587, 182],
    ],
    0.29,
    black,
  );
  panel(
    'Counterblade outer armor',
    [
      [1614, 139],
      [1727, 166],
      [1727, 208],
      [1633, 188],
      [1593, 178],
    ],
    0.17,
  );
  disk('Counterblade joint', 1631, 193, 18, 0.43, black);
  disk('Counterblade joint inset', 1631, 193, 13, 0.46, deepRed);
  bolt(1631, 193, 0.244, 6);
  bolt(1659, 313, 0.2, 4);
  for (const u of [1660, 1707]) bolt(u, 173 + (u - 1660) * 0.2, 0.204, 2.3);

  active = groups.shaft;
  tube('Upper black rifle barrel', [1382, 353], [1654, 353], 12, black);
  tube('Inner barrel liner', [1390, 352], [1658, 352], 5, gunmetal);
  for (let u = 1412; u < 1570; u += 27)
    panel(
      'Barrel cooling inset',
      [
        [u, 357],
        [u + 15, 357],
        [u + 17, 359],
        [u + 15, 362],
        [u, 362],
        [u - 2, 360],
      ],
      0.098,
      deepRed,
      0.012,
    );
  plate(
    'Red fore-end frame',
    [
      [1188, 329],
      [1202, 346],
      [1211, 337],
      [1245, 337],
      [1248, 331],
      [1257, 331],
      [1263, 338],
      [1319, 338],
      [1319, 326],
      [1400, 333],
      [1418, 331],
      [1404, 371],
      [1382, 371],
      [1375, 357],
      [1224, 357],
      [1211, 368],
      [1191, 368],
    ],
    0.28,
    red,
  );
  panel(
    'Long black fore-end inset',
    [
      [1201, 346],
      [1385, 348],
      [1381, 358],
      [1220, 357],
      [1210, 361],
      [1200, 360],
    ],
    0.166,
    recess,
    0.018,
  );
  plate(
    'Front barrel clamp',
    [
      [1400, 331],
      [1417, 332],
      [1406, 367],
      [1378, 373],
      [1387, 354],
    ],
    0.35,
    black,
  );
  panel(
    'Front barrel clamp lip',
    [
      [1407, 330],
      [1417, 332],
      [1408, 360],
      [1401, 361],
    ],
    0.197,
    redEdge,
    0.018,
  );
  box('Under-barrel rib', 1259, 372, 50, 10, 0.22, black);
  for (const u of [1222, 1282, 1350, 1397]) bolt(u, 341, 0.178, 2);
  tube('Lower telescoping shaft', [540, 364], [865, 364], 7, black);
  tube('Shaft bright sliding edge', [562, 363], [773, 363], 2, gunmetal, 0.052);
  box('Shaft extension collar', 791, 364, 37, 18, 0.19, black);
  for (const u of [775, 785, 795, 805])
    box('Grip ring', u, 364, 1.4, 18.5, 0.194, grip);

  active = groups.receiver;
  plate(
    'Rifle receiver core',
    [
      [862, 336],
      [979, 336],
      [979, 344],
      [1094, 344],
      [1105, 329],
      [1171, 330],
      [1174, 326],
      [1202, 328],
      [1190, 379],
      [1017, 380],
      [1007, 375],
      [873, 375],
    ],
    0.36,
    black,
  );
  panel(
    'Receiver red body',
    [
      [866, 337],
      [975, 338],
      [975, 350],
      [1096, 350],
      [1104, 333],
      [1168, 333],
      [1162, 355],
      [1029, 356],
      [1017, 373],
      [876, 372],
    ],
    0.21,
  );
  panel(
    'Receiver dark inset',
    [
      [1017, 374],
      [1030, 357],
      [1164, 357],
      [1159, 375],
    ],
    0.238,
    black,
    0.025,
  );
  box('Upper receiver rail', 1038, 344, 101, 10, 0.225, deepRed);
  box('Ejection port recess', 1071, 345, 38, 10, 0.018, recess, 0.249);
  box('Ejection port chamber', 1074, 345, 25, 6, 0.02, gunmetal, 0.261);
  plate(
    'Angular magazine',
    [
      [998, 380],
      [1090, 380],
      [1090, 439],
      [998, 420],
    ],
    0.3,
    black,
  );
  panel(
    'Magazine red plate',
    [
      [1003, 384],
      [1085, 384],
      [1085, 432],
      [1003, 416],
    ],
    0.18,
    deepRed,
  );
  panel(
    'Magazine panel',
    [
      [1008, 388],
      [1081, 388],
      [1081, 426],
      [1008, 413],
    ],
    0.205,
    red,
    0.025,
  );
  box('Magazine base plate', 1044, 422, 87, 5, 0.36, black).rotation.z = -0.2;
  // Scope above the lower rifle section. Its axis follows the shaft.
  box('Scope mounting foot', 919, 336, 33, 10, 0.23, black);
  box('Scope mount', 919, 328, 18, 27, 0.16, red);
  tube('Optic tube', [885, 317], [946, 317], 7, red);
  tube('Optic rear bell', [884, 317], [896, 317], 10, black);
  tube('Optic front bell', [935, 317], [947, 317], 10, black);
  tube('Optic lens', [946, 317], [947, 317], 7, lens);
  box('Scope turret', 919, 309, 16, 6, 0.17, gunmetal);
  box('Scope turret cover', 919, 308, 13, 3, 0.19, red);
  for (const sign of [-1, 1]) {
    tube(
      'Bolt action handle',
      [1088, 345],
      [1099, 335],
      3.5,
      gunmetal,
      sign * 0.27,
    );
    disk('Bolt handle knob', 1099, 335, 6, 0.1, black, sign * 0.3);
  }
  const trigger = new THREE.Shape();
  const tp = point(850, 345);
  trigger.absarc(tp.x, tp.y, 0.077, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(tp.x, tp.y, 0.055, 0, Math.PI * 2, true);
  trigger.holes.push(hole);
  const tg = new THREE.ExtrudeGeometry(trigger, {
    depth: 0.095,
    bevelEnabled: false,
  });
  tg.translate(0, 0, -0.0475);
  mesh(tg, black, 'Rear sling ring');
  plate(
    'Trigger underside',
    [
      [843, 374],
      [856, 374],
      [850, 382],
    ],
    0.15,
    red,
  );
  for (const p of [
    [882, 347],
    [967, 347],
    [1006, 364],
    [1122, 341],
    [1020, 397],
    [1073, 407],
  ] as P[])
    bolt(...p, 0.246, 2.3);

  active = groups.pommel;
  plate(
    'Butt spike central tang',
    [
      [337, 362],
      [437, 343],
      [494, 343],
      [503, 349],
      [560, 349],
      [568, 362],
      [561, 377],
      [503, 378],
      [494, 381],
      [437, 381],
    ],
    0.14,
    black,
  );
  plate(
    'Butt cap red housing',
    [
      [505, 350],
      [558, 350],
      [565, 362],
      [559, 374],
      [501, 376],
    ],
    0.24,
    red,
  );
  panel(
    'Butt red centerline',
    [
      [338, 362],
      [438, 357],
      [500, 358],
      [500, 366],
      [438, 366],
    ],
    0.085,
    red,
    0.018,
  );
  panel(
    'Upper prong cutting edge',
    [
      [338, 362],
      [437, 343],
      [440, 349],
      [438, 353],
    ],
    0.08,
    steel,
    0.02,
  );
  panel(
    'Lower prong cutting edge',
    [
      [338, 362],
      [437, 381],
      [440, 376],
      [438, 371],
    ],
    0.08,
    steel,
    0.02,
  );
  for (const u of [447, 496]) {
    box('Pommel blade separation', u, 362, 10, 41, 0.2, recess);
    box('Upper pommel edge', u - 19, 346, 39, 5, 0.17, steel);
    box('Lower pommel edge', u - 19, 379, 39, 5, 0.17, steel);
  }
  disk('Butt spike pivot', 555, 363, 6, 0.3, black);
  bolt(555, 363, 0.161, 3.1);

  active = groups.blade;
  disk('Lower folding hinge axle', 1624, 742, 7, 1.8, gunmetal, 0);
  disk('Lower folding hinge cap', 1624, 742, 11, 0.08, deepRed, 0.84);
  disk('Main telescoping hinge axle', 1684, 403, 8, 1.08, gunmetal, 0.15);
  active = groups.counterblade;
  disk('Counter folding hinge axle', 1674, 359, 7, 0.95, gunmetal, -0.22);
  disk('Counter folding hinge cap', 1674, 359, 10, 0.06, deepRed, -0.7);
  active = groups.receiver;
  plate(
    'Folding trigger grip',
    [
      [865, 367],
      [886, 369],
      [884, 418],
      [872, 429],
      [857, 421],
    ],
    0.19,
    black,
  );
  panel(
    'Grip inset',
    [
      [868, 380],
      [880, 381],
      [878, 414],
      [872, 419],
      [864, 414],
    ],
    0.12,
    grip,
    0.018,
  );
  // A bore visible behind the pronged muzzle; the whole segment retracts together.
  active = groups.pommel;
  tube('Muzzle bore surround', [436, 362], [447, 362], 8, gunmetal);
  tube('Muzzle dark bore', [435, 362], [436, 362], 5, recess);
  const rig = createCrescentRig(root, groups);
  root.rotation.z = -0.18;
  root.updateMatrixWorld(true);
  const rest = new THREE.Box3().setFromObject(root);
  const center = rest.getCenter(new THREE.Vector3());
  return {
    root,
    groups,
    center,
    bounds: rest,
    rig: rig.joints,
    setTransformation: rig.setTransformation,
    setBoltProgress: rig.setBoltProgress,
    getTransformation: rig.getProgress,
    createAnimationClip: rig.createAnimationClip,
    setExplode: rig.setExplode,
    setFinish(finish: Finish) {
      materials.forEach((m, i) => {
        m.color.copy(originals[i].color);
        m.wireframe = finish === 'wireframe';
        m.metalness = finish === 'original' ? 0.04 : originals[i].metalness;
        m.roughness = finish === 'original' ? 0.85 : originals[i].roughness;
        if (finish === 'wireframe') m.color.set('#aabac8');
        m.needsUpdate = true;
      });
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
    },
  };
}
