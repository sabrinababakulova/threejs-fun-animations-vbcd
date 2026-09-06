import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStudioEnvironment } from './studio-environment';
import { prepareMiku, type MikuFinish } from './miku-character';
import { addMikuDetails } from './miku-details';
import { createOrbitMotionTracker } from './miku-hair-physics';

export type MikuView = 'hero' | 'front' | 'back' | 'face' | 'outfit';

export function createMikuScene(
  host: HTMLElement,
  callbacks: {
    onReady: () => void;
    onError: (message: string) => void;
    onInteract: () => void;
    onProgress: (percent: number) => void;
  },
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#dbe4e7');
  scene.fog = new T.Fog('#dbe4e7', 10, 30);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Hatsune Miku in 3D. Drag to orbit and scroll to zoom, or use the camera buttons.',
  );
  host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(30, 1, 0.01, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 8;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.screenSpacePanning = true;
  controls.listenToKeyEvents(renderer.domElement);
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  scene.add(new T.HemisphereLight('#ecf8ff', '#92979d', 1.65));
  const key = new T.DirectionalLight('#fff3e9', 2.65);
  key.position.set(-3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -2.5,
    right: 2.5,
    top: 3,
    bottom: -2,
    near: 0.1,
    far: 12,
  });
  key.shadow.normalBias = 0.014;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new T.DirectionalLight('#d9efff', 1.5);
  fill.position.set(3, 2, 4);
  scene.add(fill);
  const rim = new T.DirectionalLight('#d4fff7', 2.3);
  rim.position.set(1, 4, -3);
  scene.add(rim);
  const floor = new T.Mesh(
    new T.PlaneGeometry(200, 200),
    new T.MeshStandardMaterial({
      color: '#c5d2d8',
      roughness: 0.82,
      metalness: 0.02,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  scene.add(floor);
  // A very soft grounding shadow keeps boots connected to the floor even at
  // frontal lighting angles where a directional shadow is nearly hidden.
  const shadowData = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const distance = Math.hypot((x - 63.5) / 63.5, (y - 63.5) / 63.5);
      const i = (y * 128 + x) * 4;
      shadowData[i] = 33;
      shadowData[i + 1] = 46;
      shadowData[i + 2] = 54;
      shadowData[i + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 95);
    }
  const contactTexture = new T.DataTexture(shadowData, 128, 128);
  contactTexture.needsUpdate = true;
  const contact = new T.Mesh(
    new T.PlaneGeometry(1.8, 1.2),
    new T.MeshBasicMaterial({
      map: contactTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.003;
  scene.add(contact);

  const motionPreference = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  let disposed = false,
    character: ReturnType<typeof prepareMiku> | null = null;
  let eyeTexture: T.Texture | null = null;
  let costumeDetails: ReturnType<typeof addMikuDetails> | null = null;
  let hairEnabled = !motionPreference.matches,
    wind = 0.8,
    lastTime = 0;
  const orbitMotion = createOrbitMotionTracker();
  let currentView: MikuView = 'hero',
    manual = false;
  let transition: {
    start: number;
    from: T.Vector3;
    to: T.Vector3;
    fromTarget: T.Vector3;
    target: T.Vector3;
  } | null = null;
  function setView(view: MikuView, animate = true) {
    orbitMotion.reset();
    currentView = view;
    manual = false;
    const close = view === 'face',
      outfit = view === 'outfit';
    const target = new T.Vector3(
      0,
      close ? 1.78 : outfit ? 1.25 : 0.9,
      close ? 0.025 : 0,
    );
    const fit = Math.max(
      2.1 / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2)),
      1.55 /
        (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2) * camera.aspect),
    );
    const distance = close
      ? Math.max(1.12, 0.56 / camera.aspect)
      : outfit
        ? Math.max(1.85, 0.85 / camera.aspect)
        : fit * 1.34;
    const direction = new T.Vector3(
      view === 'hero' ? 0.22 : close ? 0.06 : 0,
      close ? 0.015 : outfit ? 0.06 : 0.07,
      view === 'back' ? -1 : 1,
    ).normalize();
    const to = target.clone().add(direction.multiplyScalar(distance));
    if (animate && !motionPreference.matches)
      transition = {
        start: performance.now(),
        from: camera.position.clone(),
        to,
        fromTarget: controls.target.clone(),
        target,
      };
    else {
      transition = null;
      camera.position.copy(to);
      controls.target.copy(target);
      controls.update();
    }
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!manual) setView(currentView, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const onInteraction = () => {
    manual = true;
    transition = null;
    callbacks.onInteract();
  };
  controls.addEventListener('start', onInteraction);
  const onLost = (event: Event) => {
    event.preventDefault();
    callbacks.onError(
      'The 3D display was interrupted. Reload the viewer to reconnect.',
    );
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  const onMotionPreference = () => {
    orbitMotion.reset();
    hairEnabled = !motionPreference.matches;
    host.dispatchEvent(
      new CustomEvent('miku-motion-preference', { detail: hairEnabled }),
    );
  };
  motionPreference.addEventListener('change', onMotionPreference);
  const onVisibility = () => {
    orbitMotion.reset();
    lastTime = 0;
  };
  document.addEventListener('visibilitychange', onVisibility);

  async function load() {
    // Track both resources even when one fails so late completion is disposed.
    const [modelResult, textureResult] = await Promise.allSettled([
      new GLTFLoader().loadAsync('/models/miku/miku.glb', (event) => {
        if (!disposed && event.total)
          callbacks.onProgress(Math.round((event.loaded / event.total) * 90));
      }),
      new T.TextureLoader().loadAsync('/models/miku/eyes.png'),
    ]);
    if (textureResult.status === 'fulfilled') eyeTexture = textureResult.value;
    if (modelResult.status === 'fulfilled')
      character = prepareMiku(modelResult.value.scene, eyeTexture ?? undefined);
    if (disposed) {
      character?.dispose();
      character = null;
      eyeTexture?.dispose();
      eyeTexture = null;
      return;
    }
    if (
      modelResult.status === 'rejected' ||
      textureResult.status === 'rejected'
    ) {
      callbacks.onError(
        'Miku’s model could not finish loading. Reload the viewer to try again.',
      );
      return;
    }
    eyeTexture!.colorSpace = T.SRGBColorSpace;
    eyeTexture!.anisotropy = Math.min(
      8,
      renderer.capabilities.getMaxAnisotropy(),
    );
    scene.add(character!.root);
    costumeDetails = addMikuDetails(character!);
    setView('hero', false);
    await renderer.compileAsync(scene, camera);
    if (!disposed) {
      callbacks.onProgress(100);
      callbacks.onReady();
    }
  }
  void load().catch((error) => {
    if (!disposed)
      callbacks.onError(
        'The 3D viewer could not start. Enable hardware acceleration, then reload.',
      );
    console.error(error);
  });

  renderer.setAnimationLoop((now: number) => {
    if (disposed) return;
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.1);
    lastTime = now;
    if (document.hidden) {
      orbitMotion.reset();
      return;
    }
    if (transition) {
      const t = Math.min((now - transition.start) / 650, 1),
        eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, transition.to, eased);
      controls.target.lerpVectors(
        transition.fromTarget,
        transition.target,
        eased,
      );
      if (t === 1) transition = null;
    }
    controls.update();
    const motionActive = hairEnabled && !motionPreference.matches;
    const motion = orbitMotion.sample(
      controls.getAzimuthalAngle(),
      controls.getPolarAngle(),
      dt,
      motionActive && manual,
    );
    if (motionActive) character?.hairPhysics.advance(dt, wind, motion);
    renderer.render(scene, camera);
  });
  return {
    setView,
    setFinish(finish: MikuFinish) {
      character?.setFinish(finish);
    },
    setHair(enabled: boolean) {
      hairEnabled = enabled;
      orbitMotion.reset();
    },
    setWind(value: number) {
      wind = T.MathUtils.clamp(value, 0, 1.6);
    },
    zoom(factor: number) {
      transition = null;
      manual = true;
      const offset = camera.position.clone().sub(controls.target);
      const distance = T.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    },
    async snapshot() {
      renderer.render(scene, camera);
      const blob = await new Promise<Blob | null>((resolve) =>
        renderer.domElement.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Snapshot unavailable');
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'hatsune-miku.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.removeEventListener('start', onInteraction);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      motionPreference.removeEventListener('change', onMotionPreference);
      document.removeEventListener('visibilitychange', onVisibility);
      costumeDetails?.dispose();
      costumeDetails = null;
      character?.dispose();
      character = null;
      eyeTexture?.dispose();
      eyeTexture = null;
      floor.geometry.dispose();
      floor.material.dispose();
      contact.geometry.dispose();
      contact.material.dispose();
      contactTexture.dispose();
      key.shadow.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type MikuViewerAPI = ReturnType<typeof createMikuScene>;
