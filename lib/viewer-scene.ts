import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createTransformationPlayback,
  type WeaponForm,
} from './transformation-playback';
import { TRANSFORM_DURATION, smoothStage } from './crescent-rig';
import { createStudioEnvironment } from './studio-environment';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  createCrescentRose,
  type PartName,
  type Finish,
} from './crescent-rose';

export type CameraView = 'hero' | 'front' | 'back' | 'side';
export function createViewerScene(host: HTMLElement, onInteract: () => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101218');
  scene.fog = new THREE.Fog('#101218', 32, 75);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive 3D model of Crescent Rose. Drag to orbit, scroll to zoom. Use the view buttons for keyboard control.',
  );
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(33, 1, 0.05, 150);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2;
  controls.maxDistance = 65;
  controls.autoRotateSpeed = 0.75;
  controls.maxPolarAngle = Math.PI * 0.96;
  controls.screenSpacePanning = true;
  controls.listenToKeyEvents(renderer.domElement);
  const model = createCrescentRose();
  scene.add(model.root);
  const playback = createTransformationPlayback(TRANSFORM_DURATION);
  let automaticFraming = false,
    leadIn = 0,
    boltElapsed: number | null = null,
    lastStateUpdate = 0;
  let separation = 0,
    reassembly: { from: number; elapsed: number } | null = null;
  const publishMechanismState = (force = false) => {
    const now = performance.now();
    if (!force && now - lastStateUpdate < 33) return;
    lastStateUpdate = now;
    host.dispatchEvent(
      new CustomEvent('mechanism-state', {
        detail: { ...playback.getState(), boltActive: boltElapsed !== null },
      }),
    );
  };
  const env = createStudioEnvironment(renderer);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.95;
  scene.add(new THREE.HemisphereLight('#dce5f3', '#25212a', 0.65));
  const key = new THREE.DirectionalLight('#fff3ea', 3.4);
  key.position.set(-5, 9, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    near: 0.5,
    far: 45,
  });
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#d7e6ff', 1.25);
  fill.position.set(5, 2, -6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#e0eaff', 3.0);
  rim.position.set(-4, 7, -4);
  scene.add(rim);
  const floorY = model.bounds.min.y - 0.55;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({
      color: '#16191e',
      metalness: 0.15,
      roughness: 0.7,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(70, 70, '#4a525d', '#353d48');
  grid.position.y = floorY + 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.26;
  grid.visible = false;
  scene.add(grid);
  const targetBuffer = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, targetBuffer);
  const beautyPass = new RenderPass(scene, camera);
  const contactPass = new GTAOPass(scene, camera, 1, 1);
  contactPass.blendIntensity = 0.65;
  contactPass.updateGtaoMaterial({
    radius: 0.26,
    thickness: 0.75,
    distanceFallOff: 0.7,
    samples: 8,
  });
  contactPass.updatePdMaterial({ samples: 8, radius: 4 });
  const outputPass = new OutputPass();
  composer.addPass(beautyPass);
  composer.addPass(contactPass);
  composer.addPass(outputPass);
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let view: CameraView = 'hero',
    manual = false,
    disposed = false;
  let transition: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    target: THREE.Vector3;
    start: number;
  } | null = null;
  const direction = (v: CameraView) =>
    v === 'front'
      ? new THREE.Vector3(0, 0, 1)
      : v === 'back'
        ? new THREE.Vector3(0, 0, -1)
        : v === 'side'
          ? new THREE.Vector3(1, 0.01, 0.04)
          : new THREE.Vector3(0.48, 0.15, 1).normalize();
  const distanceToFit = (bounds: THREE.Box3) => {
    const size = bounds.getSize(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(camera.fov) / 2;
    return (
      Math.max(
        size.y / (2 * Math.tan(fov)),
        size.x / (2 * Math.tan(fov) * camera.aspect),
        size.z * 1.5,
      ) * 1.2
    );
  };
  const moveTo = (
    target: THREE.Vector3,
    position: THREE.Vector3,
    animate = true,
  ) => {
    if (animate && !reducedMotion)
      transition = {
        from: camera.position.clone(),
        to: position,
        fromTarget: controls.target.clone(),
        target,
        start: performance.now(),
      };
    else {
      transition = null;
      controls.target.copy(target);
      camera.position.copy(position);
      controls.update();
    }
  };
  const setView = (v: CameraView, animate = true) => {
    view = v;
    manual = false;
    const bounds = new THREE.Box3().setFromObject(model.root);
    const target = bounds.getCenter(new THREE.Vector3());
    let dist = distanceToFit(bounds);
    if (v === 'side')
      dist = Math.max(
        (bounds.getSize(new THREE.Vector3()).y /
          (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) *
          1.25,
        10,
      );
    moveTo(
      target,
      target.clone().add(direction(v).multiplyScalar(dist)),
      animate,
    );
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    // Contact shading needs less resolution than the anti-aliased beauty pass.
    contactPass.setSize(Math.ceil(width), Math.ceil(height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!manual && !automaticFraming) setView(view, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const startInteraction = () => {
    manual = true;
    automaticFraming = false;
    transition = null;
    controls.autoRotate = false;
    onInteract();
  };
  controls.addEventListener('start', startInteraction);
  let previous = performance.now();
  const render = () => {
    if (disposed || document.hidden) return;
    const now = performance.now();
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (reassembly) {
      reassembly.elapsed += delta;
      separation =
        reassembly.from * (1 - smoothStage(reassembly.elapsed, 0, 0.45));
      model.setExplode(separation);
      if (reassembly.elapsed >= 0.45) {
        separation = 0;
        reassembly = null;
      }
    }
    if (leadIn > 0) leadIn = Math.max(0, leadIn - delta);
    else if (playback.tick(delta)) {
      model.setTransformation(playback.getState().progress);
      publishMechanismState(!playback.getState().playing);
    }
    if (boltElapsed !== null) {
      boltElapsed += delta;
      model.setBoltProgress(Math.min(boltElapsed / 1.6, 1));
      if (boltElapsed >= 1.6) {
        boltElapsed = null;
        model.setBoltProgress(0);
        publishMechanismState(true);
      }
    }
    if (automaticFraming) {
      const bounds = new THREE.Box3().setFromObject(model.root),
        target = bounds.getCenter(new THREE.Vector3());
      const dist = Math.max(distanceToFit(bounds) * 1.06, 7);
      const destination = target
        .clone()
        .add(direction(view).multiplyScalar(dist));
      const damping = 1 - Math.exp(-14 * delta);
      camera.position.lerp(destination, damping);
      controls.target.lerp(target, damping);
      if (
        !playback.getState().playing &&
        camera.position.distanceTo(destination) < 0.002
      )
        automaticFraming = false;
    }
    if (transition) {
      const t = Math.min((now - transition.start) / 650, 1);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(transition.from, transition.to, e);
      controls.target.lerpVectors(transition.fromTarget, transition.target, e);
      if (t === 1) transition = null;
    }
    controls.update(delta);
    composer.render();
  };
  renderer.setAnimationLoop(render);
  const visibility = () => {
    previous = performance.now();
  };
  document.addEventListener('visibilitychange', visibility);
  const contextLost = (e: Event) => {
    e.preventDefault();
    host.dispatchEvent(
      new CustomEvent('viewer-error', {
        detail:
          'The 3D graphics context was interrupted. Reload the viewer to continue.',
      }),
    );
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const prepareMechanism = () => {
    controls.autoRotate = false;
    if (separation > 0) reassembly = { from: separation, elapsed: 0 };
    model.setBoltProgress(0);
    boltElapsed = null;
    transition = null;
    automaticFraming = true;
    manual = false;
    view = 'hero';
  };
  return {
    setView(v: CameraView, animate = true) {
      automaticFraming = false;
      setView(v, animate);
    },
    transformTo(form: WeaponForm) {
      prepareMechanism();
      leadIn = reassembly ? 0.45 : 0;
      playback.playTo(form);
      if (reducedMotion) {
        reassembly = null;
        separation = 0;
        model.setExplode(0);
        playback.seek(form === 'rifle' ? 1 : 0);
        model.setTransformation(playback.getState().progress);
        setView('hero', false);
        automaticFraming = false;
      }
      publishMechanismState(true);
    },
    toggleTransformation() {
      if (!playback.getState().playing) {
        prepareMechanism();
        leadIn = reassembly ? 0.45 : 0;
      }
      playback.togglePause();
      publishMechanismState(true);
    },
    seekTransformation(value: number) {
      prepareMechanism();
      leadIn = 0;
      playback.seek(value);
      model.setTransformation(playback.getState().progress);
      publishMechanismState(true);
    },
    setTransformationSpeed(speed: number) {
      playback.setSpeed(speed);
      publishMechanismState(true);
    },
    cycleBolt() {
      if (
        playback.getState().progress !== 1 ||
        playback.getState().playing ||
        boltElapsed !== null
      )
        return;
      boltElapsed = 0;
      publishMechanismState(true);
    },
    setFinish(finish: Finish) {
      model.setFinish(finish);
      scene.environmentIntensity = finish === 'original' ? 0.22 : 0.95;
      contactPass.enabled = finish === 'studio';
    },
    setGrid(value: boolean) {
      grid.visible = value;
    },
    setAutoRotate(value: boolean) {
      automaticFraming = false;
      controls.autoRotate = value;
    },
    setExplode(value: number) {
      reassembly = null;
      separation = value;
      model.setExplode(value);
    },
    focusPart(part: PartName, animate = true) {
      automaticFraming = false;
      manual = true;
      controls.autoRotate = false;
      model.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.groups[part]);
      const target = bounds.getCenter(new THREE.Vector3());
      const dist = Math.max(distanceToFit(bounds) * 1.3, 5);
      moveTo(
        target,
        target.clone().add(direction('hero').multiplyScalar(dist)),
        animate,
      );
    },
    zoom(factor: number) {
      automaticFraming = false;
      manual = true;
      transition = null;
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor)
        .clampLength(controls.minDistance, controls.maxDistance)
        .add(controls.target);
      controls.update();
    },
    screenshot() {
      composer.render();
      renderer.domElement.toBlob((blob) => {
        if (blob) download(blob, 'crescent-rose.png');
      }, 'image/png');
    },
    async exportGLB() {
      const { GLTFExporter } =
        await import('three/addons/exporters/GLTFExporter.js');
      // Export the clean assembled asset regardless of inspection settings.
      const cleanModel = createCrescentRose();
      const clip = cleanModel.createAnimationClip();
      cleanModel.setTransformation(playback.getState().progress);
      try {
        const result = await new GLTFExporter().parseAsync(cleanModel.root, {
          binary: true,
          animations: [clip],
        });
        if (!(result instanceof ArrayBuffer))
          throw new Error('The model could not be exported.');
        download(
          new Blob([result], { type: 'model/gltf-binary' }),
          playback.getState().progress === 1
            ? 'crescent-rose-rifle.glb'
            : 'crescent-rose.glb',
        );
      } finally {
        cleanModel.dispose();
      }
    },
    getState() {
      return {
        mechanism: { ...playback.getState(), boltActive: boltElapsed !== null },
        view: manual ? 'custom' : view,
        autoRotate: controls.autoRotate,
        meshCount: (() => {
          let n = 0;
          model.root.traverse((o) => {
            if (o instanceof THREE.Mesh) n++;
          });
          return n;
        })(),
      };
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.removeEventListener('start', startInteraction);
      controls.dispose();
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      model.dispose();
      env.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      key.shadow.dispose();
      composer.dispose();
      beautyPass.dispose();
      contactPass.dispose();
      outputPass.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
export type ViewerAPI = ReturnType<typeof createViewerScene>;
