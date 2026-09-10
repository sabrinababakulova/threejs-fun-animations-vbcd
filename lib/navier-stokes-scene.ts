import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStudioEnvironment } from './studio-environment';
import {
  createSwirlGeometry,
  createSwirlMaterial,
} from './navier-stokes-model';
import {
  advanceFlow,
  bounded,
  initialPlayback,
  singularityScales,
  DEFAULT_VISCOSITY,
  MIN_VISCOSITY,
  MAX_VISCOSITY,
  COLLAPSE_LIMIT,
  COLLAPSE_SECONDS,
  SIMILARITY_H,
  type FlowPlayback,
} from './navier-stokes-flow';

export type SwirlView = 'perspective' | 'front' | 'top';
export type SwirlAPI = {
  setViscosity: (value: number) => void;
  setSpeed: (value: number) => void;
  setPlaying: (value: boolean) => void;
  setSingularity: (value: boolean) => void;
  seek: (value: number) => void;
  setGuides: (value: boolean) => void;
  setView: (view: SwirlView) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  snapshot: () => Promise<void>;
  dispose: () => void;
};

export function createSwirlScene(
  host: HTMLDivElement,
  callbacks: {
    onState: (state: FlowPlayback) => void;
    onInteract: () => void;
    onError: (message: string) => void;
  },
): SwirlAPI {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f6f6');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Animated Navier–Stokes swirl. Drag to orbit; use the camera buttons to change view or zoom.',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 1.1;
  controls.maxDistance = 45;
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight('#ffffff', '#728590', 2.1));
  const key = new THREE.DirectionalLight('#fff7ed', 3.2);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#d5e9ff', 2);
  fill.position.set(5, 1, -3);
  scene.add(fill);
  const { material, uniforms } = createSwirlMaterial();
  const mesh = new THREE.Mesh(
    createSwirlGeometry(DEFAULT_VISCOSITY).geometry,
    material,
  );
  mesh.frustumCulled = false; // The vertex shader moves the displayed surface.
  scene.add(mesh);

  const guides = new THREE.Group();
  const axisMaterial = new THREE.LineBasicMaterial({
    color: '#a6b4b8',
    transparent: true,
    opacity: 0.65,
  });
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -4.05, 0),
      new THREE.Vector3(0, 4.05, 0),
    ]),
    axisMaterial,
  );
  guides.add(axis);
  const upper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 3.8, 0),
    0.38,
    '#91a3a8',
    0.16,
    0.075,
  );
  const lower = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, -3.8, 0),
    0.38,
    '#91a3a8',
    0.16,
    0.075,
  );
  guides.add(upper, lower);
  scene.add(guides);

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = initialPlayback(!preference.matches);
  let disposed = false,
    failed = false,
    frame = 0,
    last = 0,
    lastReport = 0;
  let viscosity = DEFAULT_VISCOSITY,
    pendingViscosity: number | null = null;
  let selectedView: SwirlView | null = 'perspective';
  let reportedState = state;
  const emit = () => {
    reportedState = state;
    callbacks.onState({ ...state });
  };
  const applyState = () => {
    const scales = singularityScales(state.singularity ? state.progress : 0);
    uniforms.uFlowTime.value = state.time;
    uniforms.uFlowScale.value.set(scales.radial, scales.axial, scales.radial);
    guides.scale.copy(uniforms.uFlowScale.value);
  };
  const fitView = (view: SwirlView) => {
    selectedView = view;
    // Reserve room for the camera toolbar below the scientific plate.
    controls.target.set(0, view === 'top' ? 0 : -0.45, 0);
    const distance = Math.max(16.5, 12.4 / Math.max(camera.aspect, 0.35));
    const direction =
      view === 'front'
        ? new THREE.Vector3(0, 0, 1)
        : view === 'top'
          ? new THREE.Vector3(0, 1, 0.001)
          : new THREE.Vector3(0.7, 0.32, 1);
    camera.position
      .copy(direction.normalize().multiplyScalar(distance))
      .add(controls.target);
    controls.update();
  };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (selectedView) fitView(selectedView);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const interaction = () => {
    selectedView = null;
    callbacks.onInteract();
  };
  controls.addEventListener('start', interaction);
  const motionPreference = () => {
    if (preference.matches) {
      state = { ...state, playing: false };
      emit();
    }
  };
  preference.addEventListener('change', motionPreference);
  const error = (message: string) => {
    if (failed || disposed) return;
    failed = true;
    state = { ...state, playing: false };
    cancelAnimationFrame(frame);
    emit();
    callbacks.onError(message);
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    error('The graphics connection was lost. Reload the viewer to continue.');
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.debug.onShaderError = () =>
    error(
      'The swirl shader could not start. Enable hardware acceleration and reload the viewer.',
    );
  const animate = (now: number) => {
    if (disposed || failed) return;
    if (pendingViscosity !== null) {
      viscosity = pendingViscosity;
      pendingViscosity = null;
      const previous = mesh.geometry;
      mesh.geometry = createSwirlGeometry(viscosity).geometry;
      previous.dispose();
    }
    state = advanceFlow(state, last ? (now - last) / 1000 : 0);
    last = now;
    applyState();
    controls.update();
    renderer.render(scene, camera);
    if (state !== reportedState && now - lastReport > 100) {
      emit();
      lastReport = now;
    }
    if (!failed) frame = requestAnimationFrame(animate);
  };
  const visibility = () => {
    cancelAnimationFrame(frame);
    last = 0;
    if (!document.hidden && !disposed && !failed)
      frame = requestAnimationFrame(animate);
  };
  document.addEventListener('visibilitychange', visibility);
  emit();
  applyState();
  if (!document.hidden) frame = requestAnimationFrame(animate);

  return {
    setViscosity(value) {
      pendingViscosity = bounded(
        value,
        MIN_VISCOSITY,
        MAX_VISCOSITY,
        viscosity,
      );
    },
    setSpeed(value) {
      state = { ...state, speed: bounded(value, 0.25, 3, 1) };
      emit();
    },
    setPlaying(value) {
      if (value && state.singularity && state.progress >= COLLAPSE_LIMIT)
        state = { ...state, progress: 0, time: 0 };
      state = { ...state, playing: value };
      emit();
    },
    setSingularity(value) {
      state = { ...state, singularity: value, progress: 0, time: 0 };
      emit();
    },
    seek(value) {
      const progress = bounded(value, 0, COLLAPSE_LIMIT, 0);
      // Scrubbing is an explicit pause. Phase is derived from time, not accumulated drags.
      state = {
        ...state,
        progress,
        time:
          (COLLAPSE_SECONDS * ((1 - progress) ** -SIMILARITY_H - 1)) /
          SIMILARITY_H,
        playing: false,
      };
      emit();
    },
    setGuides(value) {
      guides.visible = value;
    },
    setView: fitView,
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      camera.position.copy(controls.target).add(offset);
      controls.update();
      selectedView = null;
    },
    reset() {
      state = initialPlayback(!preference.matches);
      pendingViscosity = DEFAULT_VISCOSITY;
      guides.visible = true;
      fitView('perspective');
      emit();
    },
    async snapshot() {
      if (disposed || failed) throw new Error('Viewer unavailable');
      applyState();
      renderer.render(scene, camera);
      const blob = await new Promise<Blob>((resolve, reject) =>
        renderer.domElement.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error('Could not encode image')),
          'image/png',
        ),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'navier-stokes-swirl.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', motionPreference);
      controls.removeEventListener('start', interaction);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      mesh.geometry.dispose();
      material.dispose();
      // ArrowHelper shares geometry internally: release each resource only once.
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      guides.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          geometries.add(node.geometry);
          (Array.isArray(node.material)
            ? node.material
            : [node.material]
          ).forEach((m) => materials.add(m));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((m) => m.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
