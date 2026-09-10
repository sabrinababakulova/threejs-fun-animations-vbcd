import * as THREE from 'three';
import {
  createFlowSeeds,
  traceFlow,
  angularVelocity,
  DEFAULT_VISCOSITY,
  bounded,
  MIN_VISCOSITY,
  MAX_VISCOSITY,
} from './navier-stokes-flow.ts';

export const FLOW_COLORS = [
  '#39bac4',
  '#277bb7',
  '#455fa6',
  '#cb8544',
] as const;

export function flowColor(relativeAngularSpeed: number) {
  const t = THREE.MathUtils.clamp(relativeAngularSpeed, 0, 1);
  const stops = [0, 0.23, 0.56, 1];
  const interval = t < stops[1] ? 0 : t < stops[2] ? 1 : 2;
  return new THREE.Color(FLOW_COLORS[interval]).lerp(
    new THREE.Color(FLOW_COLORS[interval + 1]),
    (t - stops[interval]) / (stops[interval + 1] - stops[interval]),
  );
}

/** One merged draw call; tube centers stay on the integrated flow trajectories. */
export function createSwirlGeometry(
  viscosity: number,
  count = 84,
  segments = Math.ceil(
    240 *
      Math.max(
        1,
        DEFAULT_VISCOSITY /
          bounded(viscosity, MIN_VISCOSITY, MAX_VISCOSITY, DEFAULT_VISCOSITY),
      ),
  ),
) {
  const paths = createFlowSeeds(count).map((seed) =>
    traceFlow(seed, viscosity, segments),
  );
  const sides = 8;
  const ring = sides + 1;
  const vertexCount = paths.length * (segments + 1) * ring;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const offsets = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const flow = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(paths.length * segments * sides * 6);
  const peak = angularVelocity(0, viscosity);
  let vertex = 0,
    index = 0;
  const tangent = new THREE.Vector3(),
    radial = new THREE.Vector3(),
    binormal = new THREE.Vector3(),
    offset = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (const path of paths) {
    const base = vertex;
    for (let j = 0; j <= segments; j++) {
      const point = path.points[j];
      const before = path.points[Math.max(0, j - 1)];
      const after = path.points[Math.min(segments, j + 1)];
      tangent
        .set(after.x - before.x, after.y - before.y, after.z - before.z)
        .normalize();
      radial.set(point.x, 0, point.z).normalize();
      radial.addScaledVector(tangent, -radial.dot(tangent)).normalize();
      binormal.crossVectors(tangent, radial).normalize();
      const color = flowColor(point.omega / peak);
      // An elliptical cross-section gives the reference's mix of ribbons and filaments.
      const ribbonWidth =
        path.seed.width * (1.1 + 1.3 * Math.sin((Math.PI * j) / segments));
      for (let k = 0; k <= sides; k++) {
        const angle = (k / sides) * Math.PI * 2;
        const c = Math.cos(angle),
          s = Math.sin(angle);
        offset
          .copy(radial)
          .multiplyScalar(c * ribbonWidth)
          .addScaledVector(binormal, s * path.seed.width * 0.58);
        normal
          .copy(radial)
          .multiplyScalar(c / ribbonWidth)
          .addScaledVector(binormal, s / (path.seed.width * 0.58))
          .normalize();
        positions.set([point.x, point.y, point.z], vertex * 3);
        offsets.set(offset.toArray(), vertex * 3);
        normals.set(normal.toArray(), vertex * 3);
        colors.set([color.r, color.g, color.b], vertex * 3);
        flow.set(
          [j / segments, path.duration, path.seed.phase, path.seed.width],
          vertex * 4,
        );
        vertex++;
      }
      if (j < segments) {
        for (let k = 0; k < sides; k++) {
          const a = base + j * ring + k,
            b = a + ring;
          indices.set([a, a + 1, b, b, a + 1, b + 1], index);
          index += 6;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5.2);
  return { geometry, paths };
}

export function createSwirlMaterial() {
  const uniforms = {
    uFlowTime: { value: 0 },
    uFlowScale: { value: new THREE.Vector3(1, 1, 1) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.3,
    roughness: 0.31,
    clearcoat: 0.32,
    clearcoatRoughness: 0.3,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      attribute vec3 aOffset;
      attribute vec4 aFlow;
      uniform float uFlowTime;
      uniform vec3 uFlowScale;
      varying float vEnvelope;
    `,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `
      vec3 objectNormal = normalize(normal / uFlowScale);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `
      float age = aFlow.x;
      float q = fract(age - uFlowTime / aFlow.y + aFlow.z);
      vEnvelope = smoothstep(0.0, 0.13, q) * (1.0 - smoothstep(0.7, 0.96, q))
        * smoothstep(0.0, 0.035, age) * (1.0 - smoothstep(0.94, 1.0, age));
      vec3 transformed = (position + aOffset * vEnvelope) * uFlowScale;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying float vEnvelope;
    `,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `
      #include <clipping_planes_fragment>
      if (vEnvelope < 0.015) discard;
    `,
      );
  };
  material.customProgramCacheKey = () => 'navier-stokes-packets-v1';
  return { material, uniforms };
}
