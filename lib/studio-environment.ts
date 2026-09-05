import * as THREE from 'three';

/** Large photographic softboxes reflected in enamel and blade bevels. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#252932');
  const panels: THREE.Mesh[] = [];
  const softbox = (
    w: number,
    h: number,
    at: [number, number, number],
    color: string,
    intensity: number,
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    panel.position.set(...at);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    panels.push(panel);
  };
  softbox(7, 16, [-8, 5, 7], '#fff0e5', 4.5);
  softbox(3, 20, [9, 1, 3], '#d4e3ff', 3.8);
  softbox(14, 5, [1, 12, -4], '#ffffff', 5);
  softbox(2, 16, [-4, 2, -10], '#e1e8f5', 3);
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(studio, 0.025);
  panels.forEach((p) => {
    p.geometry.dispose();
    (p.material as THREE.Material).dispose();
  });
  generator.dispose();
  return environment;
}
