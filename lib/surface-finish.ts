import * as THREE from 'three';

/** Broad patina is baked into vertex colors (including GLB exports). A subtle
 * object-space microfinish adds grain in the live PBR renderer without textures. */
export function finishSurface(mesh: THREE.Mesh) {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const painted = material.color.r > material.color.g * 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const variation = Math.sin(x * 13 + y * 9) * Math.sin(y * 17 - z * 21);
    const face = 0.955 + variation * 0.025;
    const nz = Math.abs(normal.getZ(i));
    const chamfer = painted && nz > 0.1 && nz < 0.96 ? 0.13 : 0;
    colors[i * 3] = face;
    colors[i * 3 + 1] = face - chamfer * 0.16;
    colors[i * 3 + 2] = face - chamfer * 0.12;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  material.vertexColors = true;
  if (material.userData.microfinish) return;
  material.userData.microfinish = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSurfacePosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSurfacePosition = position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSurfacePosition;
        float surfaceHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float surfaceNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1,0,0)),f.x),
            mix(surfaceHash(i+vec3(0,1,0)),surfaceHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(surfaceHash(i+vec3(0,0,1)),surfaceHash(i+vec3(1,0,1)),f.x),
            mix(surfaceHash(i+vec3(0,1,1)),surfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float grain = surfaceNoise(vSurfacePosition * 190.0);
        float brushing = surfaceNoise(vSurfacePosition * vec3(180.0, 4.0, 180.0));
        roughnessFactor = clamp(roughnessFactor + (grain - 0.5) * 0.07
          + (brushing - 0.5) * 0.045 * metalness, 0.06, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => 'crescent-microfinish-v1';
}
