// A single product object in the world: loads its generated GLB (or falls back to its image),
// normalises it onto a pedestal and exposes the "transform" controls used by the configurator.
import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../data.js';
import { createProductUniforms, patchMaterial, averageLuminance } from './productMaterial.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

const sources = new Map(); // id → Promise<{ scene?: Object3D, texture?: Texture }>

export function loadSource(product) {
  if (sources.has(product.id)) return sources.get(product.id);
  const p = loader
    .loadAsync(assetUrl.model(product.id))
    .then((gltf) => ({ scene: gltf.scene }))
    .catch(() =>
      texLoader
        .loadAsync(assetUrl.image(product.id))
        .then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          return { texture };
        })
        .catch(() => ({})),
    );
  sources.set(product.id, p);
  return p;
}

const FINISH = {
  matte: { roughness: 1.0, clearcoat: 0, clearcoatRoughness: 0.4 },
  gloss: { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 },
  waxed: { roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.25 },
};

const _box = new THREE.Box3();
const raycaster = new THREE.Raycaster();

export class ProductObject {
  constructor(product, source) {
    this.product = product;
    this.configurable = !!(product.colors || product.finishes);
    this.uniforms = createProductUniforms();
    this.materials = [];
    this.meshes = [];
    this.root = new THREE.Group(); // sits on the pedestal
    this.float = new THREE.Group(); // idle float + claim flight
    this.spin = new THREE.Group(); // yaw / pitch (user rotation, cursor attention)
    this.root.add(this.float);
    this.float.add(this.spin);
    this.root.userData.product = product;
    this.yaw = product.yaw || 0;
    this.targetYaw = this.yaw;
    this.pitch = 0;
    this.targetPitch = 0;
    this.userYaw = 0;
    this.attention = 0;
    this.idle = true;
    this.floatBase = 0.05;
    this.floatAmp = 0.015;
    this.floatSpeed = 1.1;

    this.model = this.#build(source);
    this.spin.add(this.model);
    this.#normalise();
    this.hotspots = this.#buildHotspots();
    this.shadow = this.#buildShadow();
    this.root.add(this.shadow);
    this.spin.rotation.y = this.yaw;
  }

  #build(source) {
    let obj;
    if (source?.scene) {
      obj = source.scene.clone(true);
      obj.traverse((m) => {
        if (!m.isMesh) return;
        m.material = this.#prepareMaterial(m.material);
        m.castShadow = false;
        m.receiveShadow = false;
        this.meshes.push(m);
      });
    } else {
      // Image fallback (or an abstract placeholder when nothing could be fetched).
      const tex = source?.texture;
      const mat = this.#prepareMaterial(
        new THREE.MeshStandardMaterial({
          map: tex || null,
          color: tex ? 0xffffff : 0x1c1c1e,
          roughness: 0.6,
          metalness: 0.1,
          transparent: !!tex,
          alphaTest: tex ? 0.3 : 0,
          side: THREE.DoubleSide,
        }),
      );
      const geo = tex ? new THREE.PlaneGeometry(1, 1) : new THREE.IcosahedronGeometry(0.5, 1);
      obj = new THREE.Mesh(geo, mat);
      obj.userData.billboard = !!tex;
      this.billboard = !!tex;
      this.meshes.push(obj);
    }
    return obj;
  }

  #prepareMaterial(src) {
    let mat = src;
    if (this.configurable && !mat.isMeshPhysicalMaterial) {
      const phys = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(phys, mat);
      mat = phys;
    } else {
      mat = mat.clone();
    }
    if (this.configurable) {
      mat.metalnessMap = null;
      mat.metalness = 0;
    }
    if (mat.map) this.uniforms.uAvgLum.value = averageLuminance(mat.map);
    mat.envMapIntensity = 1;
    patchMaterial(mat, this.uniforms);
    this.materials.push(mat);
    return mat;
  }

  #normalise() {
    const p = this.product;
    if (!this.billboard) this.model.rotation.y += p.face || 0;
    this.model.updateMatrixWorld(true);
    _box.setFromObject(this.model);
    const size = _box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = (p.size || 1) / maxDim;
    this.model.scale.multiplyScalar(s);
    this.model.updateMatrixWorld(true);
    _box.setFromObject(this.model);
    const c = _box.getCenter(new THREE.Vector3());
    this.model.position.x -= c.x;
    this.model.position.z -= c.z;
    this.model.position.y -= _box.min.y;
    this.model.updateMatrixWorld(true);
    _box.setFromObject(this.model);
    this.bounds = _box.clone();
    this.height = this.bounds.max.y - this.bounds.min.y;
    this.footprint = Math.max(this.bounds.max.x - this.bounds.min.x, this.bounds.max.z - this.bounds.min.z);
    this.uniforms.uBoundsMin.value.copy(this.bounds.min);
    this.uniforms.uBoundsMax.value.copy(this.bounds.max);
    // hover a touch above the pedestal
    this.float.position.y = 0.04;
  }

  #buildHotspots() {
    const b = this.bounds;
    const size = b.getSize(new THREE.Vector3());
    return (this.product.hotspots || []).map((h) => {
      const local = new THREE.Vector3(
        b.min.x + size.x * h.at[0],
        b.min.y + size.y * h.at[1],
        b.min.z + size.z * h.at[2],
      );
      const dir = new THREE.Vector3(...h.dir).normalize();
      // snap onto the surface: shoot a ray from outside the object back towards the point
      raycaster.set(local.clone().addScaledVector(dir, 3), dir.clone().negate());
      this.spin.updateMatrixWorld(true);
      const hits = raycaster.intersectObjects(this.meshes, false);
      const anchor = new THREE.Object3D();
      if (hits.length && !this.billboard) {
        anchor.position.copy(this.spin.worldToLocal(hits[0].point.clone()));
      } else {
        anchor.position.copy(local).addScaledVector(dir, size.z * 0.5);
      }
      anchor.userData = { ...h, normal: dir };
      this.spin.add(anchor);
      return anchor;
    });
  }

  #buildShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.003;
    const f = this.footprint * 1.1;
    mesh.scale.set(f, f * 0.8, 1);
    return mesh;
  }

  // ── configuration ─────────────────────────────────────────
  applyConfig(cfg, animate = true) {
    const p = this.product;
    const u = this.uniforms;
    const color = p.colors?.find((c) => c.id === cfg.color);
    const finish = FINISH[cfg.finish] || (this.configurable ? FINISH.matte : null);
    const dur = animate ? 1.1 : 0;

    if (color) {
      const next = new THREE.Color(color.hex);
      if (animate && !next.equals(u.uTint.value)) {
        u.uPrevTint.value.copy(u.uTint.value);
        u.uPrevTintMix.value = u.uTintMix.value;
        u.uTint.value.copy(next);
        u.uTintMix.value = 0.94;
        gsap.fromTo(u.uSweep, { value: -0.06 }, { value: 1.08, duration: dur, ease: 'power2.inOut' });
      } else {
        u.uTint.value.copy(next);
        u.uPrevTint.value.copy(next);
        u.uTintMix.value = u.uPrevTintMix.value = 0.94;
        u.uSweep.value = 1.5;
      }
    }
    if (this.configurable) {
      const metal = color?.metal || 0;
      for (const m of this.materials) {
        const to = { metalness: metal, roughness: metal ? Math.max(0.32, finish.roughness * 0.5) : finish.roughness };
        if (m.isMeshPhysicalMaterial) Object.assign(to, { clearcoat: finish.clearcoat, clearcoatRoughness: finish.clearcoatRoughness });
        if (animate) gsap.to(m, { ...to, duration: dur * 0.8, ease: 'power2.inOut' });
        else Object.assign(m, to);
      }
    }
  }

  setReveal(v) {
    this.uniforms.uReveal.value = v;
  }

  setSilhouette(v) {
    this.uniforms.uSilhouette.value = v;
  }

  // ── per-frame ─────────────────────────────────────────────
  update(dt, t, camera) {
    const k = 1 - Math.exp(-dt * 4);
    this.yaw += (this.targetYaw + this.userYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.spin.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.idle) this.float.position.y = this.floatBase + Math.sin(t * this.floatSpeed + this.root.position.x) * this.floatAmp;
    if (this.billboard && camera) {
      this.spin.rotation.set(0, Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z), 0);
    }
    this.spin.updateMatrixWorld(true);
    this.uniforms.uRootInv.value.copy(this.spin.matrixWorld).invert();
    this.uniforms.uTime.value = t;
  }

  centerWorld(target = new THREE.Vector3()) {
    this.spin.updateMatrixWorld(true);
    return target.set(0, this.bounds.min.y + this.height * 0.5, 0).applyMatrix4(this.spin.matrixWorld);
  }

  // A detached copy with its own materials (used in YOUR COLLECTION and the order confirmation).
  replica(cfg) {
    const copy = new ProductObject(this.product, this.billboard ? { texture: this.materials[0].map } : { scene: this.#sourceScene });
    if (cfg) copy.applyConfig(cfg, false);
    return copy;
  }

  set sourceScene(s) {
    this.#sourceScene = s;
  }
  #sourceScene = null;

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

export async function createProduct(product) {
  const source = await loadSource(product);
  const obj = new ProductObject(product, source);
  obj.sourceScene = source.scene || null;
  return obj;
}

