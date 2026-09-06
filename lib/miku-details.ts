import * as T from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { prepareMiku } from './miku-character';

/** Project fine costume markings onto the already-posed, stationary body. */
export function addMikuDetails(character: ReturnType<typeof prepareMiku>) {
  const details = new T.Group();
  details.name = 'Costume markings';
  const textures: T.CanvasTexture[] = [];
  const resources: T.Mesh[] = [];
  const texture = (
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    draw(ctx);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    textures.push(map);
    return map;
  };
  const cv01 = texture(512, 512, (ctx) => {
    ctx.fillStyle = '#ba3353';
    ctx.font = '500 270px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('01', 256, 315);
    ctx.font = '27px Arial';
    ctx.fillText('HATSUNE MIKU', 256, 372);
  });
  const sleeve = texture(256, 768, (ctx) => {
    ctx.fillStyle = '#121e29';
    ctx.fillRect(0, 0, 256, 768);
    ctx.strokeStyle = '#92937b';
    ctx.lineWidth = 4;
    ctx.strokeRect(9, 9, 238, 750);
    ctx.fillStyle = '#cbbb62';
    ctx.font = '16px monospace';
    ctx.fillText('VOCAL / 01', 27, 45);
    ctx.fillStyle = '#314551';
    ctx.fillRect(27, 70, 202, 106);
    ctx.strokeStyle = '#7bddcc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < 192; x++) {
      const y = 125 + Math.sin(x * 0.14) * Math.sin(x * 0.041) * 32;
      if (x === 0) ctx.moveTo(32 + x, y);
      else ctx.lineTo(32 + x, y);
    }
    ctx.stroke();
    for (let r = 0; r < 12; r++) {
      const y = 218 + r * 31;
      ctx.fillStyle = '#8d956e';
      ctx.fillRect(28, y, 24, 9);
      ctx.fillStyle = '#3a5056';
      ctx.fillRect(64, y, 164, 9);
      ctx.fillStyle = r % 3 === 0 ? '#61beb3' : '#b9b45f';
      ctx.fillRect(64, y, 42 + ((r * 37) % 113), 9);
    }
    ctx.fillStyle = '#90a5a6';
    ctx.font = '12px monospace';
    ctx.fillText('VOICE  VELOCITY', 28, 630);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = '#adb6ab';
      ctx.fillRect(28 + i * 17, 653, 14, 63);
      if (i % 3 !== 0) {
        ctx.fillStyle = '#1d2931';
        ctx.fillRect(38 + i * 17, 653, 9, 38);
      }
    }
    ctx.fillStyle = '#7c8b8d';
    ctx.font = '11px monospace';
    ctx.fillText('CV SERIES · CONTROL', 28, 742);
  });
  const nameplate = texture(512, 128, (ctx) => {
    ctx.fillStyle = '#8e7751';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#e5d9ad';
    ctx.font = '22px monospace';
    ctx.fillText('VOCALOID', 24, 42);
    ctx.font = 'bold 34px monospace';
    ctx.fillText('HATSUNE MIKU', 24, 96);
  });
  function bake(materialName: string) {
    const source = character.meshes.find(
      (m) => (m.material as T.Material).name === materialName,
    ) as T.SkinnedMesh | undefined;
    if (!source) return null;
    source.skeleton.update();
    const geometry = new T.BufferGeometry(),
      positions: number[] = [],
      p = new T.Vector3();
    for (let i = 0; i < source.geometry.attributes.position.count; i++) {
      source.getVertexPosition(i, p);
      p.applyMatrix4(source.matrixWorld);
      positions.push(p.x, p.y, p.z);
    }
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(source.geometry.index!.clone());
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(
      geometry,
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
    );
    mesh.updateMatrixWorld(true);
    return mesh;
  }
  function project(
    mesh: T.Mesh,
    map: T.Texture | null,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
  ) {
    if (!map) return;
    const ray = new T.Raycaster(
      new T.Vector3(x, y, 2),
      new T.Vector3(0, 0, -1),
    );
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return;
    const geometry = new DecalGeometry(
      mesh,
      hit.point,
      new T.Euler(0, 0, angle),
      new T.Vector3(width, height, 0.11),
    );
    // Projected vertices are world-space. Convert once into the model's space.
    geometry.applyMatrix4(character.root.matrixWorld.clone().invert());
    const material = new T.MeshStandardMaterial({
      map,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: 0.65,
      metalness: 0.08,
    });
    const decal = new T.Mesh(geometry, material);
    decal.name = 'Projected costume detail';
    decal.renderOrder = 2;
    details.add(decal);
    resources.push(decal);
  }
  const skin = bake('Skin'),
    outfit = bake('Graphite outfit'),
    vest = bake('Silver vest');
  if (skin) project(skin, cv01, 0.166, 1.485, 0.068, 0.068, 0.45);
  if (outfit) {
    project(outfit, sleeve, 0.294, 1.216, 0.067, 0.24, 0.39);
    project(outfit, sleeve, -0.27, 1.197, 0.067, 0.24, -0.36);
  }
  if (vest) project(vest, nameplate, -0.072, 1.525, 0.057, 0.018, -0.02);
  for (const mesh of [skin, outfit, vest])
    if (mesh) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
    }
  character.root.add(details);
  return {
    dispose() {
      resources.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
      });
      textures.forEach((t) => t.dispose());
      details.removeFromParent();
    },
  };
}
