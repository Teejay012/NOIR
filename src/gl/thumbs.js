// Renders configured products into small images for the bag, checkout and collection.
// Uses its own tiny renderer so the thumbnails show the exact colour / finish that was claimed.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class ThumbRenderer {
  constructor(size = 320) {
    this.size = size;
    this.cache = new Map();
  }

  #init() {
    if (this.renderer) return;
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.size, this.size, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(0xdfe6ff, 1.2);
    rim.position.set(-3, 2, -3);
    this.scene.add(key, rim);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  }

  render(source, cfg) {
    const key = `${source.product.id}|${JSON.stringify(cfg)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    try {
      this.#init();
      const obj = source.replica(cfg);
      obj.shadow.visible = false;
      obj.spin.rotation.set(0.12, (source.product.yaw || 0), 0, 'YXZ');
      obj.update(0, 0, this.camera);
      obj.spin.rotation.set(0.12, (source.product.yaw || 0), 0, 'YXZ');
      obj.spin.updateMatrixWorld(true);
      obj.uniforms.uRootInv.value.copy(obj.spin.matrixWorld).invert();
      this.scene.add(obj.root);
      const size = Math.max(obj.height, obj.footprint);
      this.camera.position.set(0, obj.height * 0.5 + size * 0.35, size * 2.3);
      this.camera.lookAt(0, obj.height * 0.5 + 0.03, 0);
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      this.scene.remove(obj.root);
      obj.dispose();
      this.cache.set(key, url);
      return url;
    } catch {
      return null;
    }
  }
}
