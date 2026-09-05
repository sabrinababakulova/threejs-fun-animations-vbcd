import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createCrescentRose,
  type PartName,
  type Finish,
} from './crescent-rose';

export type CameraView = 'hero' | 'front' | 'back' | 'side';
export function createViewerScene(host: HTMLElement, onInteract: () => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1f25');
  scene.fog = new THREE.Fog('#1b1f25', 40, 90);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
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
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.7;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#dce5f3', '#43414a', 1.55));
  const key = new THREE.DirectionalLight('#fff3ea', 3.2);
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
  const fill = new THREE.DirectionalLight('#d7e6ff', 1.6);
  fill.position.set(5, 2, -6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 2.2);
  rim.position.set(-4, 7, -4);
  scene.add(rim);
  const floorY = model.bounds.min.y - 0.55;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({
      color: '#20252c',
      metalness: 0.1,
      roughness: 0.95,
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
  scene.add(grid);
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
          : new THREE.Vector3(0.19, 0.07, 1).normalize();
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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!manual) setView(view, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const startInteraction = () => {
    manual = true;
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
    if (transition) {
      const t = Math.min((now - transition.start) / 650, 1);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(transition.from, transition.to, e);
      controls.target.lerpVectors(transition.fromTarget, transition.target, e);
      if (t === 1) transition = null;
    }
    controls.update(delta);
    renderer.render(scene, camera);
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
  return {
    setView,
    setFinish(finish: Finish) {
      model.setFinish(finish);
      scene.environmentIntensity = finish === 'original' ? 0.22 : 0.7;
    },
    setGrid(value: boolean) {
      grid.visible = value;
    },
    setAutoRotate(value: boolean) {
      controls.autoRotate = value;
    },
    setExplode(value: number) {
      model.setExplode(value);
    },
    focusPart(part: PartName, animate = true) {
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
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        if (blob) download(blob, 'crescent-rose.png');
      }, 'image/png');
    },
    async exportGLB() {
      const { GLTFExporter } =
        await import('three/addons/exporters/GLTFExporter.js');
      // Export the clean assembled asset regardless of inspection settings.
      const cleanModel = createCrescentRose();
      try {
        const result = await new GLTFExporter().parseAsync(cleanModel.root, {
          binary: true,
        });
        if (!(result instanceof ArrayBuffer))
          throw new Error('The model could not be exported.');
        download(
          new Blob([result], { type: 'model/gltf-binary' }),
          'crescent-rose.glb',
        );
      } finally {
        cleanModel.dispose();
      }
    },
    getState() {
      return {
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
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
export type ViewerAPI = ReturnType<typeof createViewerScene>;
