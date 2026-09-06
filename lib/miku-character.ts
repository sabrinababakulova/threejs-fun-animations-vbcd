import * as T from 'three';

export type MikuFinish = 'studio' | 'toon';

/** Only hair bones are touched after the initial pose. Body/face stay still. */
export function prepareMiku(root: T.Group, eyeTexture?: T.Texture) {
  const bones = new Map<string, T.Bone>();
  const meshes: T.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof T.Bone)
      bones.set(object.userData.sourceName ?? object.name, object);
    if (object instanceof T.Mesh) meshes.push(object);
  });
  const pose = (name: string, x: number, y: number, z: number) =>
    bones.get(name)?.rotation.set(x, y, z);
  pose('左腕', -0.06, 0.05, -0.48);
  pose('右腕', -0.04, -0.08, 0.56);
  pose('左ひじ', -0.16, -0.12, -0.06);
  pose('右ひじ', -0.12, 0.08, 0.04);
  pose('左手首', 0.02, -0.08, 0.12);
  pose('右手首', 0.01, 0.06, -0.09);
  pose('頭', 0, -0.035, -0.035);
  // A slight turnout gives the otherwise symmetrical standing silhouette ease.
  pose('左足', 0, 0.1, -0.035);
  pose('右足', 0, -0.12, 0.035);
  // Keep the twin-tail roots anchored; open the silhouettes behind the arms.
  pose('左髪１', -0.035, 0, 0.055);
  pose('右髪１', -0.025, 0, -0.055);
  root.scale.setScalar(0.1);
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root, true);
  root.position.y -= bounds.min.y;
  root.updateMatrixWorld(true);

  const gradient = new T.DataTexture(
    new Uint8Array([100, 155, 202, 235, 255]),
    5,
    1,
    T.RedFormat,
  );
  gradient.minFilter = T.NearestFilter;
  gradient.magFilter = T.NearestFilter;
  gradient.needsUpdate = true;
  const physical = new Map<T.Mesh, T.Material>();
  const toon = new Map<T.Mesh, T.Material>();
  const originals = new Set<T.Material>();
  meshes.forEach((mesh) => {
    const original = mesh.material as T.MeshStandardMaterial;
    originals.add(original);
    const name = original.name;
    const isHair = name === 'Turquoise hair';
    const isSkin = name === 'Skin';
    const isEye = name === 'Iris' || name === 'Eye whites';
    const material = new T.MeshPhysicalMaterial({
      name,
      color: original.color,
      side: T.DoubleSide,
      roughness: isHair
        ? 0.46
        : isSkin
          ? 0.78
          : name === 'Silver vest'
            ? 0.54
            : 0.43,
      metalness:
        name === 'Silver vest'
          ? 0.24
          : name === 'Headset and seams'
            ? 0.34
            : 0.02,
      clearcoat: isHair ? 0.2 : name === 'Graphite outfit' ? 0.16 : 0,
      clearcoatRoughness: 0.38,
      sheen: isHair ? 0.35 : name === 'Graphite outfit' ? 0.18 : 0,
      sheenColor: new T.Color(isHair ? '#78dfd5' : '#5e7489'),
      sheenRoughness: 0.55,
      envMapIntensity: isSkin ? 0.25 : isEye ? 0.1 : 0.8,
    });
    if (isSkin || isEye) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = isEye ? 0.3 : 0.08;
    }
    if (name === 'Iris' && eyeTexture) {
      material.map = eyeTexture;
      material.roughness = 0.36;
    }
    // Fine longitudinal variation follows the sculpted hair, without new meshes
    // or per-frame vertex uploads. The deformation itself comes from the rig.
    if (isHair) {
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vStrandPosition;',
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvStrandPosition = position;',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vStrandPosition;',
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float strand = sin(vStrandPosition.x * 72.0 + sin(vStrandPosition.y * 0.42) * 1.3 + vStrandPosition.z * 29.0);
          diffuseColor.rgb *= 0.965 + 0.035 * strand;
        `,
        );
      };
      material.customProgramCacheKey = () => 'miku-hair-strands-v1';
    }
    const cel = new T.MeshToonMaterial({
      name: `${name} · cel`,
      color: material.color,
      map: material.map,
      gradientMap: gradient,
      side: T.DoubleSide,
    });
    if (name === 'Iris' && eyeTexture) {
      // Radial iris fibers and a limbal ring give the original eye UVs enough
      // definition for the portrait camera, independent of texture resolution.
      for (const eye of [material, cel]) {
        eye.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            vec2 irisUV = (vMapUv - vec2(0.5)) * vec2(1.0, 0.71);
            float radius = length(irisUV);
            float angle = atan(irisUV.y, irisUV.x);
            float fibers = sin(angle * 73.0 + radius * 55.0) * sin(angle * 39.0 - radius * 82.0);
            vec3 irisColor = mix(vec3(0.018, 0.14, 0.19), vec3(0.10, 0.58, 0.55), smoothstep(-0.25, 0.27, irisUV.y));
            irisColor *= 0.91 + fibers * 0.09;
            irisColor *= 1.0 - smoothstep(0.38, 0.50, radius) * 0.68;
            diffuseColor.rgb = mix(vec3(0.002, 0.025, 0.04), irisColor, smoothstep(0.16, 0.18, radius));
          `,
          );
        };
        eye.customProgramCacheKey = () => 'miku-iris-v1';
      }
    }
    if (isEye) {
      cel.emissive.copy(material.color);
      cel.emissiveIntensity = 0.22;
    }
    physical.set(mesh, material);
    toon.set(mesh, cel);
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = !isSkin && !isEye;
    // Moving tips can extend past the loader's rest-pose bounds.
    if (mesh instanceof T.SkinnedMesh) mesh.frustumCulled = false;
  });
  originals.forEach((material) => material.dispose());

  const hair = [...bones]
    .filter(([name]) => /^[左右]髪[１-７]$/.test(name))
    .map(([name, bone]) => ({
      bone,
      base: bone.quaternion.clone(),
      side: name.startsWith('左') ? 1 : -1,
      depth: '１２３４５６７'.indexOf(name.slice(-1)),
    }));
  const rotation = new T.Quaternion(),
    euler = new T.Euler();
  function updateHair(time: number, strength: number) {
    for (const { bone, base, side, depth } of hair) {
      // Independent phase per side, with lag and greater amplitude toward tips.
      // At depth 0 there is exactly zero motion, securing hair in the clips.
      const amplitude = strength * Math.min(depth / 4, 1);
      const phase = time * 1.22 - depth * 0.66 + side * 0.7;
      euler.set(
        amplitude *
          (0.045 * Math.sin(phase) + 0.018 * Math.sin(time * 0.57 - depth)),
        amplitude * 0.018 * Math.sin(phase * 0.8 + 0.6),
        amplitude *
          (0.055 * Math.sin(phase + 0.5) +
            0.025 * Math.sin(time * 0.63 + side) * side),
      );
      rotation.setFromEuler(euler);
      bone.quaternion.copy(base).multiply(rotation);
    }
  }
  return {
    root,
    bones,
    hair,
    meshes,
    updateHair,
    setFinish(finish: MikuFinish) {
      meshes.forEach((mesh) => {
        mesh.material = (finish === 'studio' ? physical : toon).get(mesh)!;
      });
    },
    dispose() {
      const geometries = new Set<T.BufferGeometry>(),
        skeletons = new Set<T.Skeleton>();
      meshes.forEach((mesh) => {
        geometries.add(mesh.geometry);
        if (mesh instanceof T.SkinnedMesh) skeletons.add(mesh.skeleton);
      });
      geometries.forEach((g) => g.dispose());
      skeletons.forEach((s) => s.dispose());
      physical.forEach((m) => m.dispose());
      toon.forEach((m) => m.dispose());
      gradient.dispose();
    },
  };
}
