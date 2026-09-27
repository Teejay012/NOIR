// The NOIR flagship: one continuous WebGL space. Zones sit side by side along X,
// the archive hides behind the After Dark wall, and a monumental N-01 floats on the horizon.
import * as THREE from 'three';
import gsap from 'gsap';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ZONES, ARCHIVE, PRODUCTS, byId, productsIn } from '../data.js';
import { createProduct, loadSource } from './product.js';
import { textPlane, radialTexture } from './textures.js';
import { Particles } from './particles.js';
import { ThumbRenderer } from './thumbs.js';

const SLOT = [
  { x: -3.4, z: -0.4, h: 0.92 },
  { x: 0, z: -1.7, h: 1.08 },
  { x: 3.4, z: -0.4, h: 0.92 },
];
const ARCHIVE_SLOT = [
  { x: -3.2, z: 0, h: 0.95 },
  { x: 0, z: -1.2, h: 1.1 },
  { x: 3.2, z: 0, h: 0.95 },
];

const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.045 }, uVignette: { value: 0.9 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; uniform float uVignette; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 1.15)));
      c.rgb *= mix(1.0, v, uVignette);
      c.rgb += (h(vUv * 1000.0) - 0.5) * uAmount;
      gl_FragColor = c;
    }`,
};

export class World {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.handlers = {};
    this.products = new Map();
    this.pedestals = new Map();
    this.mode = 'arrival';
    this.zoneIndex = 0;
    this.pointer = new THREE.Vector2(0, 0); // ndc
    this.pointerSmooth = new THREE.Vector2(0, 0);
    this.pointerPx = { x: innerWidth / 2, y: innerHeight / 2 };
    this.cam = { pos: new THREE.Vector3(0, 2.6, 44), target: new THREE.Vector3(0, 3.4, -60) };
    this.zoom = 1;
    this.inspected = null;
    this.paused = false;
    this.parallax = 1;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.lastInteraction = performance.now();
    this.#setupRenderer();
    this.#setupScene();
    this.#bindInput();
  }

  on(handlers) {
    Object.assign(this.handlers, handlers);
  }

  // ── setup ────────────────────────────────────────────────
  #setupRenderer() {
    const hi = this.quality === 'high';
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.75 : 1.35));
    r.setSize(innerWidth, innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.2);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;

    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 260);
    this.#fitCamera();

    const size = new THREE.Vector2(innerWidth, innerHeight);
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), hi ? 0.55 : 0.4, 0.7, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainShader);
    this.composer.addPass(this.grain);

    addEventListener('resize', () => this.resize());
  }

  #fitCamera() {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.9;
    this.camera.fov = this.portrait ? 52 : aspect < 1.3 ? 42 : 34;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setSize(innerWidth, innerHeight);
    this.#fitCamera();
    if (this.mode === 'showroom') this.goZone(this.zoneIndex, { duration: 0, slot: this.slot });
  }

  #setupScene() {
    const s = this.scene;
    // light
    this.hemi = new THREE.HemisphereLight(0xdedad2, 0x050505, 0.12);
    s.add(this.hemi);
    this.key = new THREE.SpotLight(0xfff6ea, 0, 26, 0.5, 0.9, 1.5);
    this.key.position.set(0, 9, 4.5);
    this.key.target.position.set(0, 1, -1);
    s.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(0xe4e6ee, 0.3);
    this.rim.position.set(-4, 5, -8);
    s.add(this.rim);
    this.cursorLight = new THREE.PointLight(0xfff1dc, 0, 6, 1.8);
    this.cursorLight.position.set(0, 2, 2);
    s.add(this.cursorLight);

    // floor
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.42, metalness: 0.3, envMapIntensity: 0.12 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);

    // horizon glow — the backlight for the monument silhouette
    const glowTex = radialTexture([[0, 'rgba(236,230,220,0.55)'], [0.35, 'rgba(160,156,150,0.16)'], [1, 'rgba(0,0,0,0)']]);
    this.horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 70),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0.9 }),
    );
    this.horizon.position.set(0, 10, -110);
    s.add(this.horizon);

    this.poolTex = radialTexture([[0, 'rgba(255,250,240,0.5)'], [0.4, 'rgba(255,250,240,0.12)'], [1, 'rgba(0,0,0,0)']]);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0.07 } },
      vertexShader: `varying float vY; varying float vFacing;
        void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
          vec3 n = normalize(normalMatrix * normal); vFacing = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vY; varying float vFacing;
        void main(){ float a = pow(vY, 2.2) * pow(vFacing, 2.0) * uOpacity; gl_FragColor = vec4(vec3(1.0,0.97,0.92), a); }`,
    });

    this.#buildArchitecture();
    this.#buildZones();
    this.#buildArchive();
    this.particles = new Particles(this.quality === 'high' ? 2200 : 900);
    s.add(this.particles.points);
    this.thumbs = new ThumbRenderer();
    this.collectionGroup = new THREE.Group();
    s.add(this.collectionGroup);
  }

  #buildArchitecture() {
    const s = this.scene;
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.75, metalness: 0.1, envMapIntensity: 0.25 });
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xf4efe6, toneMapped: false });
    // monoliths between zones
    for (let i = 0; i < ZONES.length - 1; i++) {
      const x = (ZONES[i].x + ZONES[i + 1].x) / 2;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 4.2), slabMat);
      slab.position.set(x, 5, -3.2);
      slab.rotation.y = i % 2 ? 0.18 : -0.18;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 9.6, 0.02), bladeMat);
      blade.position.set(0.16, 0, 2.1);
      slab.add(blade);
      s.add(slab);
    }
    // ceiling light lines receding into the dark
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true });
    for (const z of [-6, 1.5]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(110, 0.025, 0.025), lineMat);
      line.position.set(34, 9.5, z);
      s.add(line);
    }
  }

  #pedestal(x, z, h) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.38, metalness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.64, h, 64, 1), bodyMat);
    body.position.y = h / 2;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.012, 64),
      new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.2, metalness: 0.6 }),
    );
    top.position.y = h + 0.006;
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92), toneMapped: false, transparent: true, opacity: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.005, 8, 128), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h + 0.012;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({ map: this.poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.004;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.75, 7, 48, 1, true), this.beamMat.clone());
    beam.position.y = h + 3.6;
    beam.rotation.y = Math.random() * 6;
    // uv.y is 0 at the bottom of the cylinder; flip so the beam is brightest at the source
    beam.geometry.attributes.uv.array.forEach((v, i, a) => {
      if (i % 2) a[i] = 1 - v;
    });
    const sold = textPlane('SOLD', 0.1, { weight: 400, size: 120, tracking: 0.4, opacity: 0 });
    sold.position.set(0, h + 0.016, 0.3);
    sold.rotation.x = -Math.PI / 2;
    g.add(body, top, ring, pool, beam, sold);
    const anchor = new THREE.Group();
    anchor.position.y = h;
    g.add(anchor);
    return { group: g, ring, ringMat, pool, beam, sold, anchor, h, level: 1 };
  }

  #buildZones() {
    for (const zone of ZONES) {
      if (zone.id === 'collection') continue;
      const title = textPlane(zone.name, zone.name.length > 10 ? 2.1 : 3.1, { weight: 250, size: 220, tracking: -0.04, opacity: 0.075 });
      title.position.set(zone.x, 4.3, -8.9);
      this.scene.add(title);
      const idx = textPlane(`${zone.index} — ${zone.line.toUpperCase()}`, 0.16, { font: '"IBM Plex Mono", monospace', weight: 400, size: 80, tracking: 0.12, opacity: 0.4 });
      idx.position.set(zone.x, 6.3, -8.85);
      this.scene.add(idx);
      productsIn(zone.id).forEach((p) => {
        const slot = SLOT[p.slot];
        const ped = this.#pedestal(zone.x + slot.x, slot.z, slot.h);
        ped.product = p;
        this.scene.add(ped.group);
        this.pedestals.set(p.id, ped);
      });
    }
  }

  #buildArchive() {
    const ad = ZONES.find((z) => z.id === 'afterdark');
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.8, metalness: 0.1, envMapIntensity: 0.2 });
    this.doorL = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 0.4), wallMat);
    this.doorR = this.doorL.clone();
    this.doorL.position.set(ad.x - 3.5, 5, -8.6);
    this.doorR.position.set(ad.x + 3.5, 5, -8.6);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 10, 0.02), new THREE.MeshBasicMaterial({ color: 0x2c2b29, toneMapped: false }));
    seam.position.set(3.5, 0, 0.21);
    this.doorL.add(seam);
    this.scene.add(this.doorL, this.doorR);

    // the symbol: tiny, dim, easy to miss
    this.secret = textPlane('◈', 0.13, { weight: 300, size: 160, font: 'Arial, sans-serif', opacity: 0.32, pad: 0.1 });
    this.secret.position.set(ad.x + 5.6, 0.62, -8.38);
    this.secret.userData.secret = true;
    this.scene.add(this.secret);
    // generous invisible hit area
    this.secretHit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    this.secretHit.position.copy(this.secret.position);
    this.scene.add(this.secretHit);

    // the room behind
    const room = (this.archiveRoom = new THREE.Group());
    room.position.set(ARCHIVE.x, 0, ARCHIVE.z);
    const warm = new THREE.PointLight(0xffe6c8, 0, 16, 1.4);
    warm.position.set(0, 6, 3);
    this.archiveLight = warm;
    room.add(warm);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 10),
      new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(255,236,210,0.28)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, toneMapped: false }),
    );
    glow.position.set(0, 5, -7);
    room.add(glow);
    this.scene.add(room);
    productsIn('archive').forEach((p) => {
      const slot = ARCHIVE_SLOT[p.slot];
      const ped = this.#pedestal(ARCHIVE.x + slot.x, ARCHIVE.z + slot.z, slot.h);
      ped.product = p;
      this.scene.add(ped.group);
      this.pedestals.set(p.id, ped);
    });
  }

  // ── loading ──────────────────────────────────────────────
  async load(onProgress = () => {}) {
    const order = [...PRODUCTS].sort((a, b) => (a.zone === 'motion' ? -1 : 0) - (b.zone === 'motion' ? -1 : 0));
    let done = 0;
    const firstZone = [];
    const all = order.map(async (p) => {
      const obj = await createProduct(p);
      const ped = this.pedestals.get(p.id);
      ped.anchor.add(obj.root);
      obj.setReveal(-0.1);
      this.products.set(p.id, obj);
      done++;
      onProgress(done / order.length);
      return obj;
    });
    for (let i = 0; i < order.length; i++) if (order[i].zone === 'motion') firstZone.push(all[i]);
    // the monument
    loadSource(byId.n01).then(async () => {
      const m = await createProduct(byId.n01);
      m.setSilhouette(1);
      for (const mat of m.materials) mat.fog = false;
      m.idle = false;
      m.shadow.visible = false;
      m.root.scale.setScalar(9);
      m.root.position.set(0, 4.2, -62);
      m.targetYaw = -0.5;
      m.targetPitch = -0.08;
      this.monument = m;
      this.scene.add(m.root);
    });
    await Promise.all(firstZone);
    this.ready = Promise.all(all);
    return this.ready;
  }

  // ── camera choreography ──────────────────────────────────
  zoneView(i, slot = this.slot) {
    const x = ZONES[i].x;
    // portrait screens walk object by object instead of framing a whole zone
    if (this.portrait && ZONES[i].id !== 'collection') {
      const sl = SLOT[slot ?? 1];
      return { pos: new THREE.Vector3(x + sl.x, 2.35, sl.z + 7.2), target: new THREE.Vector3(x + sl.x, 1.3, sl.z - 0.4) };
    }
    const back = this.portrait ? 14 : innerWidth / innerHeight < 1.3 ? 12.5 : 10.6;
    return { pos: new THREE.Vector3(x, this.portrait ? 3.1 : 2.7, back), target: new THREE.Vector3(x, 1.35, -1.2) };
  }

  #tweenCam(pos, target, duration = 1.6, ease = 'power3.inOut') {
    gsap.killTweensOf(this.cam.pos);
    gsap.killTweensOf(this.cam.target);
    if (!duration) {
      this.cam.pos.copy(pos);
      this.cam.target.copy(target);
      return Promise.resolve();
    }
    return new Promise((res) => {
      gsap.to(this.cam.pos, { x: pos.x, y: pos.y, z: pos.z, duration, ease, onComplete: res });
      gsap.to(this.cam.target, { x: target.x, y: target.y, z: target.z, duration, ease });
    });
  }

  #moveKey(x, z = -1, intensity = 70) {
    gsap.to(this.key.position, { x, z: z + 5.5, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(this.key.target.position, { x, z, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(this.key, { intensity: intensity * 0.45, duration: 1.2 });
  }

  intro() {
    // the environment slowly materialises
    this.cam.pos.set(0, 2.6, 46);
    this.cam.target.set(0, 3.2, -60);
    gsap.to(this.renderer, { toneMappingExposure: 1, duration: 4, ease: 'power2.inOut' });
    gsap.to(this.scene.fog, { density: 0.034, duration: 7, ease: 'power2.out' });
    gsap.to(this.cam.pos, { z: 36, y: 2.3, duration: 16, ease: 'sine.out' });
    this.#moveKey(0, -1, 40);
    let i = 0;
    for (const [, obj] of this.products) {
      if (obj.product.zone === 'archive') continue;
      gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.4, delay: 1.2 + i++ * 0.12, ease: 'power2.inOut' });
    }
  }

  async enter() {
    this.mode = 'travel';
    gsap.killTweensOf(this.cam.pos);
    this.slot = 1;
    const v = this.zoneView(0, 1);
    await this.#tweenCam(v.pos, v.target, 3.2, 'power2.inOut');
    this.mode = 'showroom';
    this.zoneIndex = 0;
  }

  async goZone(i, { duration = 1.7, slot = 1 } = {}) {
    this.zoneIndex = i;
    this.slot = slot;
    const v = this.zoneView(i, slot);
    this.#moveKey(ZONES[i].x, -1, 70);
    gsap.to(this.archiveLight, { intensity: 0, duration: 1 });
    this.mode = 'travel';
    await this.#tweenCam(v.pos, v.target, duration);
    this.mode = 'showroom';
  }

  inspectView(obj) {
    const c = obj.centerWorld(new THREE.Vector3());
    const size = Math.max(obj.height, obj.footprint);
    const dist = (size * 1.75 + 0.6) * (this.portrait ? 1.55 : 1);
    const target = c.clone();
    if (this.portrait) target.y -= size * 0.42; // lift the object above the bottom sheet
    const pos = c.clone().add(new THREE.Vector3(0, size * 0.28, dist));
    return { pos, target };
  }

  async goProduct(id, { duration = 1.6 } = {}) {
    const obj = this.products.get(id);
    if (!obj) return;
    this.inspected = obj;
    this.zoom = 1;
    obj.userYaw = 0;
    obj.targetPitch = 0;
    const ped = this.pedestals.get(id);
    const zoneIdx = ZONES.findIndex((z) => z.id === obj.product.zone);
    if (zoneIdx >= 0) this.zoneIndex = zoneIdx;
    this.mode = 'travel';
    const wp = ped.group.position;
    this.#moveKey(wp.x, wp.z, 90);
    const v = this.inspectView(obj);
    this.#quiet(true);
    await this.#tweenCam(v.pos, v.target, duration);
    this.mode = 'inspect';
  }

  exitInspect() {
    const obj = this.inspected;
    this.inspected = null;
    this.#quiet(false);
    if (obj) {
      obj.userYaw = 0;
      obj.targetPitch = 0;
      obj.targetYaw = obj.product.yaw || 0;
    }
    if (obj?.product.zone === 'archive') return this.goArchive({ duration: 1.3 });
    return this.goZone(this.zoneIndex, { duration: 1.3, slot: this.slot });
  }

  // the environment becomes quieter around an inspected object
  #quiet(on) {
    gsap.to(this.particles.material.uniforms.uOpacity, { value: on ? 0.25 : 1, duration: 1.2 });
    gsap.to(this.scene, { environmentIntensity: on ? 0.5 : 0.32, duration: 1.2 });
    gsap.to(this.scene.fog, { density: on ? 0.07 : 0.034, duration: 1.4 });
    gsap.to(this.hemi, { intensity: on ? 0.12 : 0.25, duration: 1.2 });
  }

  focusHotspot(anchor) {
    const obj = this.inspected;
    if (!obj) return;
    const n = anchor.userData.normal;
    let yaw = obj.targetYaw;
    let pitch = 0;
    if (Math.abs(n.y) > 0.7) pitch = 0.7 * Math.sign(n.y);
    else yaw = Math.atan2(-n.x, n.z) + 0.25;
    obj.userYaw = 0;
    obj.targetYaw = yaw;
    obj.targetPitch = pitch;
    // where will the anchor be once the object has turned?
    const prev = obj.spin.rotation.clone();
    obj.spin.rotation.set(pitch, yaw, 0, 'YXZ');
    obj.spin.updateMatrixWorld(true);
    const p = anchor.getWorldPosition(new THREE.Vector3());
    obj.spin.rotation.copy(prev);
    obj.spin.updateMatrixWorld(true);
    const size = Math.max(obj.height, obj.footprint);
    // back away from the surface, outward from the object's centre and toward the viewer
    const c = obj.centerWorld(new THREE.Vector3());
    const out = p.clone().sub(c).normalize().lerp(new THREE.Vector3(0.15, 0.25, 1).normalize(), 0.55).normalize();
    const reach = size * 0.5 + p.distanceTo(c) + 0.35;
    const pos = p.clone().addScaledVector(out, reach);
    this.zoom = 1;
    this.mode = 'travel';
    return this.#tweenCam(pos, p, 1.3).then(() => (this.mode = 'inspect'));
  }

  resetInspectView() {
    const obj = this.inspected;
    if (!obj) return;
    obj.targetPitch = 0;
    obj.targetYaw = obj.product.yaw || 0;
    const v = this.inspectView(obj);
    this.mode = 'travel';
    return this.#tweenCam(v.pos, v.target, 1.2).then(() => (this.mode = 'inspect'));
  }

  // ── the archive ──────────────────────────────────────────
  async openArchive() {
    this.mode = 'travel';
    gsap.to(this.doorL.position, { x: this.doorL.position.x - 5.5, duration: 2.6, ease: 'power3.inOut' });
    gsap.to(this.doorR.position, { x: this.doorR.position.x + 5.5, duration: 2.6, ease: 'power3.inOut' });
    gsap.to(this.secret.material, { opacity: 0, duration: 0.6 });
    for (const p of productsIn('archive')) {
      const obj = this.products.get(p.id);
      if (obj) gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.2, delay: 1.8 + p.slot * 0.3 });
    }
    return this.goArchive({ duration: 3.4 });
  }

  async goArchive({ duration = 2 } = {}) {
    gsap.to(this.archiveLight, { intensity: 55, duration: 2 });
    this.#moveKey(ARCHIVE.x, ARCHIVE.z - 0.5, 50);
    this.mode = 'travel';
    const back = this.portrait ? 12 : 8.4;
    await this.#tweenCam(new THREE.Vector3(ARCHIVE.x, 2.2, ARCHIVE.z + back), new THREE.Vector3(ARCHIVE.x, 1.4, ARCHIVE.z - 1), duration);
    this.mode = 'archive';
  }

  setArchiveOpen(open) {
    const ad = ZONES.find((z) => z.id === 'afterdark');
    this.doorL.position.x = ad.x - 3.5 - (open ? 5.5 : 0);
    this.doorR.position.x = ad.x + 3.5 + (open ? 5.5 : 0);
    this.secret.material.opacity = open ? 0 : 0.32;
    if (open) for (const p of productsIn('archive')) this.products.get(p.id)?.setReveal(1.2);
  }

  // ── state reflections ────────────────────────────────────
  setClaimed(isClaimed) {
    for (const [id, ped] of this.pedestals) {
      const claimed = isClaimed(id);
      const obj = this.products.get(id);
      if (ped.claimed === claimed) continue;
      const first = ped.claimed === undefined;
      ped.claimed = claimed;
      gsap.to(ped.sold.material, { opacity: claimed ? 0.55 : 0, duration: first ? 0 : 1, delay: claimed && !first ? 1.2 : 0 });
      if (!obj) continue;
      if (claimed) {
        if (first) obj.root.visible = false;
      } else if (!obj.root.visible || obj.float.scale.x < 1) {
        // returned to its pedestal — re-materialise
        obj.root.visible = true;
        gsap.killTweensOf(obj.float.position);
        gsap.killTweensOf(obj.float.scale);
        obj.float.position.set(0, 0.05, 0);
        obj.float.scale.setScalar(1);
        obj.idle = true;
        if (!first) gsap.fromTo(obj.uniforms.uReveal, { value: -0.1 }, { value: 1.2, duration: 1.8, ease: 'power2.inOut' });
      }
    }
  }

  // Claim: the object leaves its pedestal and travels to the interface.
  flyToInterface(id, screen) {
    const obj = this.products.get(id);
    if (!obj) return Promise.resolve();
    obj.idle = false;
    const ndc = new THREE.Vector3((screen.x / innerWidth) * 2 - 1, -(screen.y / innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const dest = this.camera.position.clone().addScaledVector(dir, 1.4);
    obj.root.updateMatrixWorld(true);
    const local = obj.root.worldToLocal(dest.clone());
    const start = obj.float.position.clone();
    return new Promise((res) => {
      const tl = gsap.timeline({ onComplete: () => ((obj.root.visible = false), res()) });
      tl.to(obj.float.position, { y: start.y + obj.height * 0.35 + 0.15, duration: 0.7, ease: 'power2.out' });
      tl.to(obj, { userYaw: obj.userYaw + Math.PI * 1.2, duration: 1.5, ease: 'power2.inOut' }, 0);
      tl.to(obj.float.position, { x: local.x, y: local.y, z: local.z, duration: 0.85, ease: 'power3.in' }, 0.62);
      tl.to(obj.float.scale, { x: 0.06, y: 0.06, z: 0.06, duration: 0.85, ease: 'power3.in' }, 0.62);
    });
  }

  applyConfig(id, cfg, animate = true) {
    this.products.get(id)?.applyConfig(cfg, animate);
  }

  setRecommendation(id) {
    for (const [pid, obj] of this.products) {
      const on = pid === id;
      gsap.to(obj.uniforms.uGlow, { value: on ? 1 : 0, duration: 1.2 });
      const ped = this.pedestals.get(pid);
      gsap.to(ped.beam.material.uniforms.uOpacity, { value: on ? 0.22 : 0.07 * ped.level, duration: 1.2 });
    }
    this.recommended = id;
  }

  // ── the drop ─────────────────────────────────────────────
  setDrop(stateName, charge = 0) {
    this.dropState = stateName;
    for (const p of productsIn('afterdark')) {
      const obj = this.products.get(p.id);
      const ped = this.pedestals.get(p.id);
      if (stateName === 'locked') {
        obj?.setSilhouette(1);
        const lit = charge > (p.slot + 1) / 4 ? 1 : 0;
        const flicker = lit && charge < 1 ? (Math.random() > 0.08 ? 1 : 0.2) : lit;
        ped.level = 0.05 + flicker * 0.95;
      } else {
        ped.level = 1;
      }
    }
  }

  async revealDrop() {
    const items = productsIn('afterdark');
    // silence
    await new Promise((r) => gsap.to(this.renderer, { toneMappingExposure: 0.04, duration: 0.5, onComplete: r }));
    await new Promise((r) => setTimeout(r, 1300));
    this.dropState = 'revealed';
    for (const p of items) {
      const obj = this.products.get(p.id);
      this.pedestals.get(p.id).level = 1;
      if (!obj) continue;
      obj.setSilhouette(0);
      obj.setReveal(-0.1);
      gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.4, delay: 0.3 + p.slot * 0.35, ease: 'power2.inOut' });
    }
    gsap.to(this.renderer, { toneMappingExposure: 1, duration: 2.2, ease: 'power2.inOut' });
    gsap.fromTo(this.bloom, { strength: 2.2 }, { strength: this.quality === 'high' ? 0.55 : 0.4, duration: 3 });
  }

  // ── your collection ──────────────────────────────────────
  async setCollection(items) {
    for (const c of [...this.collectionGroup.children]) {
      this.collectionGroup.remove(c);
      c.userData.obj?.dispose();
    }
    const zone = ZONES.find((z) => z.id === 'collection');
    const shown = items.slice(-10);
    const perRow = 5;
    await this.ready;
    shown.forEach((item, i) => {
      const src = this.products.get(item.id);
      if (!src) return;
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const count = Math.min(perRow, shown.length - row * perRow);
      const x = zone.x + (col - (count - 1) / 2) * 1.9;
      const z = -0.6 - row * 2.4;
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.5, 1.2),
        new THREE.MeshStandardMaterial({ color: item.owned ? 0x161616 : 0x0f0f0f, roughness: 0.4, metalness: 0.3 }),
      );
      plinth.position.set(x, 0.25, z);
      const obj = src.replica(item.cfg);
      obj.root.position.set(x, 0.5, z);
      obj.root.scale.setScalar(0.72);
      obj.idle = true;
      const label = textPlane(`${item.code}${item.owned ? ' — OWNED' : ' — IN BAG'}`, 0.07, { font: '"IBM Plex Mono", monospace', size: 70, weight: 400, tracking: 0.1, opacity: 0.6 });
      label.position.set(x, 0.505, z + 0.62);
      label.rotation.x = -Math.PI / 2;
      const group = new THREE.Group();
      group.add(plinth, obj.root, label);
      group.userData.obj = obj;
      this.collectionGroup.add(group);
    });
  }

  // ── confirmation void ────────────────────────────────────
  async showVoid(item) {
    await this.ready;
    const src = this.products.get(item.id);
    if (!src) return;
    this.voidScene = new THREE.Scene();
    this.voidScene.background = new THREE.Color(0x000000);
    this.voidScene.environment = this.scene.environment;
    this.voidScene.environmentIntensity = 0.45;
    const key = new THREE.SpotLight(0xfff4e6, 60, 20, 0.5, 0.9, 1.4);
    key.position.set(2, 6, 4);
    const rim = new THREE.DirectionalLight(0xdfe5ff, 1.4);
    rim.position.set(-3, 3, -4);
    const obj = src.replica(item.cfg);
    obj.shadow.visible = false;
    obj.setReveal(-0.1);
    key.target = obj.root;
    this.voidScene.add(key, rim, obj.root);
    this.voidObj = obj;
    const size = Math.max(obj.height, obj.footprint);
    this.voidCam = this.camera.clone();
    this.voidCam.position.set(0, obj.height * 0.5 + size * 0.25, size * 2.9 + 0.5);
    this.voidCam.lookAt(0, obj.height * 0.5 - size * 0.42, 0);
    this.renderPass.scene = this.voidScene;
    this.renderPass.camera = this.voidCam;
    this.paused = false;
    gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.8, delay: 0.6, ease: 'power2.inOut' });
  }

  hideVoid() {
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.voidObj?.dispose();
    this.voidObj = null;
    this.voidScene = null;
  }

  thumbnail(id, cfg) {
    const src = this.products.get(id);
    if (!src) return null;
    return this.thumbs.render(src, cfg);
  }

  // ── projection helpers for the DOM layer ─────────────────
  project(v3) {
    const p = v3.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, visible: p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 };
  }

  productLabelPoint(id) {
    const obj = this.products.get(id);
    if (!obj) return null;
    const p = obj.centerWorld(new THREE.Vector3());
    p.y += obj.height * 0.5 + 0.25;
    return this.project(p);
  }

  anchorScreen(anchor) {
    const p = anchor.getWorldPosition(new THREE.Vector3());
    const res = this.project(p);
    // hide anchors facing away from the camera
    const n = anchor.userData.normal.clone().transformDirection(anchor.parent.matrixWorld);
    const toCam = this.camera.position.clone().sub(p).normalize();
    res.facing = n.dot(toCam) > -0.15;
    return res;
  }

  // ── input ────────────────────────────────────────────────
  #bindInput() {
    const el = this.canvas;
    const pointers = new Map();
    let down = null;
    let pinch = null;
    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, yaw: this.inspected?.userYaw || 0, pitch: this.inspected?.targetPitch || 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      }
      this.lastInteraction = performance.now();
    });
    addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pointerPx = { x: e.clientX, y: e.clientY };
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = THREE.MathUtils.clamp(pinch.zoom * (pinch.d / d), 0.45, 1.5);
        return;
      }
      if (down) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        down.moved = Math.max(down.moved, Math.hypot(dx, dy));
        if (this.mode === 'inspect' && this.inspected && down.moved > 4) {
          this.inspected.userYaw = down.yaw + dx * 0.008;
          this.inspected.targetPitch = THREE.MathUtils.clamp(down.pitch + dy * 0.004, -0.5, 0.7);
          this.lastInteraction = performance.now();
          this.handlers.onDrag?.();
        }
        if ((this.mode === 'showroom' || this.mode === 'archive') && e.pointerType !== 'mouse') this.handlers.onSwipeMove?.(dx, dy);
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!down) return;
      const d = down;
      down = null;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.moved < 6 && performance.now() - d.t < 600) this.#click(e);
      else if (e.pointerType !== 'mouse' || this.mode === 'showroom') this.handlers.onSwipe?.(dx, dy, this.mode);
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.mode === 'inspect') {
          e.preventDefault();
          this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), 0.45, 1.5);
          this.lastInteraction = performance.now();
        }
      },
      { passive: false },
    );
  }

  #pickables() {
    const list = [];
    for (const [, obj] of this.products) if (obj.root.visible && (obj.product.zone !== 'afterdark' || this.dropState === 'revealed')) list.push(...obj.meshes);
    return list;
  }

  #hit() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const secret = this.raycaster.intersectObject(this.secretHit, false);
    const hits = this.raycaster.intersectObjects(this.#pickables(), false);
    if (secret.length && (!hits.length || secret[0].distance < hits[0].distance)) return { secret: true };
    if (!hits.length) {
      // pedestal hit counts as the product (bigger target, especially for small objects)
      return null;
    }
    let o = hits[0].object;
    while (o && !o.userData.product) o = o.parent;
    return o ? { product: o.userData.product } : null;
  }

  #click() {
    if (this.mode !== 'showroom' && this.mode !== 'archive' && this.mode !== 'inspect') return;
    const h = this.#hit();
    if (this.mode === 'inspect') {
      if (h?.product && h.product.id !== this.inspected?.product.id) this.handlers.onPick?.(h.product);
      return;
    }
    if (h?.secret) this.handlers.onSecret?.();
    else if (h?.product) this.handlers.onPick?.(h.product);
  }

  // ── frame ────────────────────────────────────────────────
  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (this.paused || document.hidden) return;
      this.#frame(dt);
    };
    requestAnimationFrame(loop);
  }

  #frame(dt) {
    this.time += dt;
    const t = this.time;
    const k = 1 - Math.exp(-dt * 3);
    this.pointerSmooth.lerp(this.pointer, k);
    const px = this.pointerSmooth.x;
    const py = this.pointerSmooth.y;

    // camera = choreographed base + parallax toward the cursor + inspect zoom
    const cam = this.camera;
    const base = this.cam.pos;
    const target = this.cam.target;
    const par = this.mode === 'inspect' ? 0.12 : this.mode === 'checkout' ? 0 : 0.45;
    const offset = new THREE.Vector3(px * par, py * par * 0.5, 0);
    const pos = base.clone().add(offset);
    if (this.mode === 'inspect' || (this.mode === 'travel' && this.inspected)) {
      pos.sub(target).multiplyScalar(this.zoom).add(target);
    }
    cam.position.copy(pos);
    cam.lookAt(target.x + px * par * 0.2, target.y + py * par * 0.1, target.z);

    // hover
    if ((this.mode === 'showroom' || this.mode === 'archive' || this.mode === 'inspect') && matchMedia('(hover: hover)').matches) {
      const h = this.#hit();
      const key = h?.secret ? 'secret' : h?.product?.id || null;
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.handlers.onHover?.(h);
      }
      if (h?.secret) this.secret.material.opacity = Math.min(0.5, this.secret.material.opacity + dt * 0.3);
    } else if (this.hoverKey) {
      this.hoverKey = null;
      this.handlers.onHover?.(null);
    }

    // the cursor light — the store responds to you
    this.raycaster.setFromCamera(this.pointerSmooth, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(this.inspected ? this.inspected.centerWorld(new THREE.Vector3()).z + 0.9 : target.z + 2.4));
    const hitPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hitPoint)) {
      hitPoint.y = THREE.MathUtils.clamp(hitPoint.y, 1.1, 4);
      this.cursorLight.position.lerp(hitPoint, 1 - Math.exp(-dt * 6));
      this.particles.setMouse(hitPoint);
    }
    const wantCursor = this.mode === 'arrival' || this.mode === 'void' ? 0 : this.inspected ? 4 : 7;
    this.cursorLight.intensity += (wantCursor - this.cursorLight.intensity) * k;

    // objects turn toward you
    const zoneX = ZONES[this.zoneIndex]?.x ?? 0;
    for (const [, obj] of this.products) {
      const near = Math.abs(obj.root.getWorldPosition(_tmp).x - cam.position.x) < 8;
      if (obj !== this.inspected) {
        obj.targetYaw = (obj.product.yaw || 0) + (near ? px * 0.5 : 0) + Math.sin(t * 0.25 + obj.root.position.x) * 0.15;
        obj.targetPitch = near ? -py * 0.08 : 0;
      } else if (performance.now() - this.lastInteraction > 5000 && this.mode === 'inspect') {
        obj.userYaw += dt * 0.12; // slow turntable when left alone
      }
      if (obj.root.visible) obj.update(dt, t, cam);
    }
    if (this.monument) {
      this.monument.root.position.x = cam.position.x * 0.92;
      this.monument.root.visible = cam.position.z > -6;
      this.monument.targetYaw = -0.5 + t * 0.02 + px * 0.05;
      this.monument.update(dt, t, cam);
    }
    for (const g of this.collectionGroup.children) {
      const o = g.userData.obj;
      if (o) {
        o.targetYaw = t * 0.3;
        o.update(dt, t, cam);
      }
    }
    if (this.voidObj) {
      this.voidObj.targetYaw = t * 0.35;
      this.voidObj.update(dt, t, this.voidCam);
    }

    // pedestal lights
    for (const [id, ped] of this.pedestals) {
      const claimed = ped.claimed;
      const level = claimed ? 0.25 : ped.level;
      ped.ringMat.opacity += (level * (this.recommended === id ? 1 : 0.85) - ped.ringMat.opacity) * k;
      ped.pool.material.opacity = ped.ringMat.opacity * 0.55;
      if (this.recommended !== id) ped.beam.material.uniforms.uOpacity.value = 0.07 * ped.ringMat.opacity;
    }

    this.particles.update(dt, t);
    this.grain.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}

const _tmp = new THREE.Vector3();
