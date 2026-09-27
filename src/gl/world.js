// NOIR — one continuous space made of five worlds laid out along X.
// The camera travels between them and the whole grade (sky, fog, light, reflections)
// blends as it moves. Each world stages its three objects as a poster: one hero, two in the distance.
import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { WORLDS, worldById, PRODUCTS, byId, productsIn } from '../data.js';
import { createProduct, loadSource } from './product.js';
import { PALETTES, blendPalette, clonePalette } from './palettes.js';
import { createSkyMaterial, applyPaletteToSky, NOISE } from './sky.js';
import { BUILDERS } from './environments.js';
import { ThumbRenderer } from './thumbs.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.04 },
    uVignette: { value: 0.75 },
    uAberration: { value: 0.0015 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uAberration; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 q = vUv - 0.5;
      vec2 off = q * uAberration * length(q) * 4.0;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float v = smoothstep(0.95, 0.25, length(q * vec2(1.0, 1.2)));
      c.rgb *= mix(1.0, v, uVignette);
      c.rgb += (h(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

// Where the three objects of a world stand, relative to the world's origin.
const SPOTS = {
  hero: { x: 0, z: 0 },
  left: { x: -3.5, z: -3.4 },
  right: { x: 3.5, z: -3.4 },
};
const SIDE_LIFT = 1.05;

export class World {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.handlers = {};
    this.products = new Map();
    this.envs = new Map();
    this.layout = new Map(); // worldId → { hero, left, right } product ids
    this.mode = 'arrival';
    this.worldId = 'motion';
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.pointerPx = { x: innerWidth / 2, y: innerHeight / 2 };
    this.cam = { pos: new THREE.Vector3(0, 1.6, 26), target: new THREE.Vector3(0, 3.2, -40) };
    this.zoom = 1;
    this.inspected = null;
    this.paused = false;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.lastInteraction = performance.now();
    this.palette = clonePalette(PALETTES.canyon);
    this.fogBoost = 1;
    this.dim = 0;
    this.blackout = 0;
    this.introExposure = 0;
    this.#setupRenderer();
    this.#setupScene();
    this.#bindInput();
  }

  on(handlers) {
    Object.assign(this.handlers, handlers);
  }

  get world() {
    return worldById[this.worldId];
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
    this.pmrem = new THREE.PMREMGenerator(r);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 700);
    this.#fitCamera();

    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.4, 0.75, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    addEventListener('resize', () => this.resize());
  }

  #fitCamera() {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.9;
    this.camera.fov = this.portrait ? 46 : aspect < 1.3 ? 38 : 32;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setSize(innerWidth, innerHeight);
    this.#fitCamera();
    if (this.mode === 'poster') this.goWorld(this.worldId, { duration: 0 });
  }

  #setupScene() {
    const s = this.scene;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), createSkyMaterial());
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    s.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.rim = new THREE.DirectionalLight(0xffffff, 1);
    this.cursorLight = new THREE.PointLight(0xffffff, 0, 6, 1.8);
    s.add(this.hemi, this.key, this.key.target, this.rim, this.rim.target, this.cursorLight);

    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.1, envMapIntensity: 0.6 });
    this.floorMat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vFloorW;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFloorW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader =
        'varying vec3 vFloorW;\n' +
        NOISE +
        '\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat fn = n_fbm(vFloorW.xz * 0.35) * 0.6 + n_fbm(vFloorW.xz * 2.2) * 0.4;\ndiffuseColor.rgb *= 0.72 + fn * 0.55;',
        );
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.x = 140;
    s.add(this.floor);

    for (const w of WORLDS) {
      const env = BUILDERS[w.theme]();
      env.group.position.x = w.x;
      env.world = w;
      s.add(env.group);
      this.envs.set(w.id, env);
      const items = productsIn(w.id);
      this.layout.set(w.id, {
        hero: items.find((p) => p.slot === 1)?.id,
        left: items.find((p) => p.slot === 0)?.id,
        right: items.find((p) => p.slot === 2)?.id,
      });
    }
    this.eclipse = this.envs.get('afterdark');

    // the env scene the reflections are rendered from — same sky, plus two softboxes
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), createSkyMaterial());
    this.envScene.add(this.envSky);
    const box = (w, h, pos, int) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(int, int, int), side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      this.envScene.add(m);
      return m;
    };
    this.softKey = box(14, 6, new THREE.Vector3(-14, 16, 12), 3);
    this.softRim = box(20, 3, new THREE.Vector3(10, 6, -18), 1.6);

    this.thumbs = new ThumbRenderer();
    this.#applyPalette(true);
  }

  // ── colour grade ─────────────────────────────────────────
  #paletteAt(x) {
    const list = WORLDS;
    if (x <= list[0].x) return PALETTES[list[0].theme];
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (x <= b.x) {
        const t = THREE.MathUtils.smoothstep((x - a.x) / (b.x - a.x), 0.25, 0.75);
        return blendPalette(this._blend || (this._blend = {}), PALETTES[a.theme], PALETTES[b.theme], t);
      }
    }
    return PALETTES[list[list.length - 1].theme];
  }

  #applyPalette(force) {
    const p = this.#paletteAt(this.cam.pos.x);
    blendPalette(this.palette, p, p, 0);
    const P = this.palette;
    applyPaletteToSky(this.sky.material, P);
    this.scene.fog.color.copy(P.fog);
    this.scene.fog.density = P.fogDensity * (this.fogBoost || 1);
    this.floorMat.color.copy(P.floor);
    this.floorMat.roughness = P.floorRough;
    this.floorMat.envMapIntensity = P.floorEnv;
    this.hemi.color.copy(P.hemiSky);
    this.hemi.groundColor.copy(P.hemiGround);
    this.hemi.intensity = P.hemi;
    this.key.color.copy(P.key);
    this.key.intensity = P.keyInt;
    this.rim.color.copy(P.rim);
    this.rim.intensity = P.rimInt;
    this.scene.environmentIntensity = P.env;
    if (!this.bloomLocked) this.bloom.strength = P.bloom * (this.quality === 'high' ? 1 : 0.8);
    this.exposureBase = P.exposure;
    // reflections follow the world, re-rendered when the grade has moved far enough
    const x = Math.round(this.cam.pos.x / 12);
    if (force || x !== this.envKey) {
      this.envKey = x;
      applyPaletteToSky(this.envSky.material, P);
      this.envSky.material.uniforms.uCloud.value = 0;
      this.softKey.material.color.copy(P.key).multiplyScalar(2.6);
      this.softRim.material.color.copy(P.rim).multiplyScalar(1.4);
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
      old?.dispose();
    }
  }

  // ── loading ──────────────────────────────────────────────
  async load(onProgress = () => {}) {
    const order = [...PRODUCTS].sort((a, b) => (a.zone === 'motion' ? -1 : 0) - (b.zone === 'motion' ? -1 : 0));
    let done = 0;
    const tasks = order.map(async (p) => {
      const obj = await createProduct(p);
      obj.setReveal(-0.1);
      this.products.set(p.id, obj);
      this.scene.add(obj.root);
      this.#place(p.zone, false);
      onProgress(++done / order.length);
      return obj;
    });
    // the monument: a colossal N-01 hanging over the canyon at first light
    loadSource(byId.n01).then(async () => {
      const m = await createProduct(byId.n01);
      m.setSilhouette(1);
      for (const mat of m.materials) mat.fog = false;
      m.idle = false;
      m.shadow.visible = false;
      m.root.scale.setScalar(24);
      m.root.position.set(0, 4, -130);
      m.targetYaw = -0.4;
      m.targetPitch = 0.05;
      this.monument = m;
      this.scene.add(m.root);
    });
    await Promise.all(order.map((p, i) => (p.zone === 'motion' ? tasks[i] : null)));
    this.ready = Promise.all(tasks);
    return this.ready;
  }

  // Put a world's three objects on their spots (animated when swapping the hero).
  #place(worldId, animate = true, duration = 1.2) {
    const w = worldById[worldId];
    const env = this.envs.get(worldId);
    const lay = this.layout.get(worldId);
    for (const spot of ['hero', 'left', 'right']) {
      const obj = this.products.get(lay[spot]);
      if (!obj) continue;
      const S = SPOTS[spot];
      const isHero = spot === 'hero';
      const pos = { x: w.x + S.x, y: isHero ? env.heroY : 0, z: S.z };
      // tall objects are scaled so they never climb into the poster title
      const scale = isHero ? Math.min(this.portrait ? 1.2 : 1.3, 1.3 / Math.max(obj.height, 0.5)) : Math.min(0.72, 0.8 / Math.max(obj.height, 0.5));
      const lift = isHero ? env.heroLift : SIDE_LIFT;
      obj.spot = spot;
      obj.floatAmp = isHero ? 0.035 : 0.07;
      obj.floatSpeed = isHero ? 0.9 : 0.6 + Math.random() * 0.3;
      obj.shadow.material.opacity = isHero ? 1 : 0.35;
      if (!animate) {
        obj.root.position.set(pos.x, pos.y, pos.z);
        obj.root.scale.setScalar(scale);
        obj.floatBase = lift;
        continue;
      }
      gsap.to(obj.root.position, { ...pos, duration, ease: 'power3.inOut' });
      gsap.to(obj.root.scale, { x: scale, y: scale, z: scale, duration, ease: 'power3.inOut' });
      gsap.to(obj, { floatBase: lift, duration, ease: 'power3.inOut' });
    }
  }

  heroOf(worldId = this.worldId) {
    return this.layout.get(worldId)?.hero;
  }

  sidesOf(worldId = this.worldId) {
    const l = this.layout.get(worldId);
    return [l.left, l.right];
  }

  // Bring an object to the centre of its poster.
  setHero(id, { duration = 1.2 } = {}) {
    const p = byId[id];
    const lay = this.layout.get(p.zone);
    if (!lay || lay.hero === id) return Promise.resolve(false);
    const spot = lay.left === id ? 'left' : 'right';
    lay[spot] = lay.hero;
    lay.hero = id;
    this.#place(p.zone, true, duration);
    const obj = this.products.get(id);
    if (obj) gsap.to(obj, { userYaw: obj.userYaw + Math.PI * 2, duration: duration * 1.1, ease: 'power3.inOut', onComplete: () => (obj.userYaw = 0) });
    return new Promise((r) => setTimeout(() => r(true), duration * 1000));
  }

  // ── camera choreography ──────────────────────────────────
  posterView(worldId = this.worldId) {
    const w = worldById[worldId];
    const env = this.envs.get(worldId);
    const cy = env.heroY + env.heroLift;
    if (this.portrait) return { pos: new THREE.Vector3(w.x, cy + 1.25, 10.2), target: new THREE.Vector3(w.x, cy + 0.85, 0) };
    const back = innerWidth / innerHeight < 1.3 ? 8.8 : 7.4;
    return { pos: new THREE.Vector3(w.x, cy + 0.95, back), target: new THREE.Vector3(w.x, cy + 0.72, 0) };
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

  // A long travel between worlds arcs up and back, like a crane shot.
  #travel(pos, target, duration) {
    const from = this.cam.pos.clone();
    const dist = Math.abs(pos.x - from.x);
    if (dist < 5 || !duration) return this.#tweenCam(pos, target, duration);
    gsap.killTweensOf(this.cam.pos);
    gsap.killTweensOf(this.cam.target);
    const o = { t: 0 };
    const t0 = this.cam.target.clone();
    return new Promise((res) =>
      gsap.to(o, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const k = o.t;
          const arc = Math.sin(k * Math.PI);
          this.cam.pos.lerpVectors(from, pos, k);
          this.cam.pos.y += arc * 1.4;
          this.cam.pos.z += arc * 5;
          this.cam.target.lerpVectors(t0, target, k);
          this.cam.target.y += arc * 0.8;
        },
        onComplete: res,
      }),
    );
  }

  intro() {
    this.cam.pos.set(0, 1.5, 30);
    this.cam.target.set(0, 5, -60);
    gsap.to(this, { introExposure: 1, duration: 5, ease: 'power2.inOut' });
    this.introExposure = 0;
    gsap.to(this.cam.pos, { z: 22, y: 1.9, duration: 18, ease: 'sine.out' });
    let i = 0;
    for (const [, obj] of this.products) {
      if (obj.product.zone !== 'motion') {
        obj.setReveal(1.2);
        continue;
      }
      gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.6, delay: 1.5 + i++ * 0.25, ease: 'power2.inOut' });
    }
    for (const [, obj] of this.products) if (obj.product.zone === 'archive') obj.setReveal(-0.1);
  }

  async enter() {
    this.mode = 'travel';
    gsap.killTweensOf(this.cam.pos);
    // the monument rises into the haze
    if (this.monument) {
      gsap.to(this.monument.root.position, { y: 30, duration: 5, ease: 'power2.in' });
      gsap.to(this.monument.uniforms.uReveal, { value: -0.1, duration: 4, delay: 1, ease: 'power2.in', onComplete: () => (this.monument.root.visible = false) });
    }
    const v = this.posterView('motion');
    await this.#tweenCam(v.pos, v.target, 3.4, 'power2.inOut');
    this.mode = 'poster';
    this.worldId = 'motion';
  }

  async goWorld(id, { duration = 2.6 } = {}) {
    this.worldId = id;
    const v = this.posterView(id);
    this.mode = 'travel';
    await this.#travel(v.pos, v.target, duration);
    this.mode = 'poster';
  }

  inspectView(obj) {
    const c = obj.centerWorld(new THREE.Vector3());
    const size = Math.max(obj.height, obj.footprint) * obj.root.scale.x;
    const dist = (size * 1.85 + 0.8) * (this.portrait ? 1.5 : 1);
    const target = c.clone();
    if (this.portrait) target.y -= size * 0.4;
    const pos = c.clone().add(new THREE.Vector3(size * 0.18, size * 0.22, dist));
    return { pos, target };
  }

  async goProduct(id, { duration = 1.6 } = {}) {
    const obj = this.products.get(id);
    if (!obj) return;
    const zone = obj.product.zone;
    if (zone !== this.worldId) await this.goWorld(zone, { duration: 2.2 });
    if (this.heroOf(zone) !== id) await this.setHero(id, { duration: 1 });
    this.inspected = obj;
    this.zoom = 1;
    obj.userYaw = 0;
    obj.targetPitch = 0;
    this.mode = 'travel';
    const v = this.inspectView(obj);
    this.#quiet(true);
    await this.#tweenCam(v.pos, v.target, duration);
    this.mode = 'inspect';
  }

  exitInspect() {
    const obj = this.inspected;
    this.inspected = null;
    this.focused = false;
    this.#quiet(false);
    if (obj) {
      obj.userYaw = 0;
      obj.targetPitch = 0;
    }
    const v = this.posterView();
    this.mode = 'travel';
    return this.#tweenCam(v.pos, v.target, 1.4).then(() => (this.mode = 'poster'));
  }

  #quiet(on) {
    gsap.to(this, { fogBoost: on ? 1.6 : 1, duration: 1.4 });
    for (const [, env] of this.envs) if (env.motes) gsap.to(env.motes.material.uniforms.uOpacity, { value: on ? 0.25 : 0.7, duration: 1.2 });
    for (const id of this.sidesOf()) {
      const o = this.products.get(id);
      const s = on ? 0.0001 : Math.min(0.72, 0.8 / Math.max(o?.height || 1, 0.5));
      if (o) gsap.to(o.root.scale, { x: s, y: s, z: s, duration: on ? 0.8 : 1.2, ease: 'power3.inOut' });
    }
  }

  focusHotspot(anchor) {
    const obj = this.inspected;
    if (!obj) return;
    const n = anchor.userData.normal;
    let yaw = obj.targetYaw;
    let pitch = 0;
    if (Math.abs(n.y) > 0.7) pitch = 0.7 * Math.sign(n.y);
    else yaw = Math.atan2(-n.x, n.z) + 0.3;
    obj.userYaw = 0;
    obj.targetYaw = yaw;
    obj.targetPitch = pitch;
    const prev = obj.spin.rotation.clone();
    obj.spin.rotation.set(pitch, yaw, 0, 'YXZ');
    obj.spin.updateMatrixWorld(true);
    const p = anchor.getWorldPosition(new THREE.Vector3());
    obj.spin.rotation.copy(prev);
    obj.spin.updateMatrixWorld(true);
    const size = Math.max(obj.height, obj.footprint) * obj.root.scale.x;
    const c = obj.centerWorld(new THREE.Vector3());
    const out = p.clone().sub(c).normalize().lerp(new THREE.Vector3(0.15, 0.25, 1).normalize(), 0.55).normalize();
    const pos = p.clone().addScaledVector(out, size * 0.7 + p.distanceTo(c) + 0.45);
    this.zoom = 1;
    this.focused = true;
    this.mode = 'travel';
    return this.#tweenCam(pos, p, 1.3).then(() => (this.mode = 'inspect'));
  }

  resetInspectView() {
    const obj = this.inspected;
    if (!obj) return;
    obj.targetPitch = 0;
    this.focused = false;
    const v = this.inspectView(obj);
    this.mode = 'travel';
    return this.#tweenCam(v.pos, v.target, 1.2).then(() => (this.mode = 'inspect'));
  }

  // ── the archive: through the eclipse ─────────────────────
  async openArchive() {
    this.mode = 'travel';
    const ad = worldById.afterdark;
    const disc = this.eclipse.disc.getWorldPosition(new THREE.Vector3());
    gsap.to(this.eclipse.secret.material, { opacity: 0, duration: 0.6 });
    // dive into the black disc
    gsap.to(this.eclipse.corona.uFlare, { value: 1, duration: 2.2, ease: 'power2.in' });
    await this.#tweenCam(new THREE.Vector3(ad.x, disc.y, disc.z + 1.2), disc, 2.6, 'power3.in');
    gsap.set(this.eclipse.corona.uFlare, { value: 0 });
    await this.goArchive({ duration: 0, fromBlack: true });
  }

  async goArchive({ duration = 2.6, fromBlack = false } = {}) {
    const lay = this.layout.get('archive');
    for (const id of Object.values(lay)) {
      const o = this.products.get(id);
      if (o && o.uniforms.uReveal.value < 1) gsap.to(o.uniforms.uReveal, { value: 1.2, duration: 2.4, delay: 0.8 });
    }
    if (fromBlack) {
      this.worldId = 'archive';
      const v = this.posterView('archive');
      this.cam.pos.copy(v.pos).add(new THREE.Vector3(0, 1.5, 8));
      this.cam.target.copy(v.target).add(new THREE.Vector3(0, 1, 0));
      this.#applyPalette(true);
      this.blackout = 1;
      gsap.to(this, { blackout: 0, duration: 2.4, ease: 'power2.out' });
      await this.#tweenCam(v.pos, v.target, 3.2, 'power2.out');
      this.mode = 'poster';
      return;
    }
    return this.goWorld('archive', { duration });
  }

  setArchiveOpen(open) {
    this.eclipse.secret.material.opacity = open ? 0.18 : 0.4;
  }

  // ── state reflections ────────────────────────────────────
  // A claimed object stays in its poster as a dark ghost; the space remembers it was taken.
  setClaimed(isClaimed) {
    for (const [id, obj] of this.products) {
      const claimed = isClaimed(id);
      if (obj.claimed === claimed) continue;
      const first = obj.claimed === undefined;
      obj.claimed = claimed;
      const locked = obj.product.zone === 'afterdark' && this.dropState !== 'revealed';
      if (locked) continue;
      if (claimed) {
        if (first || obj.root.visible) {
          obj.setSilhouette(0.94);
          obj.uniforms.uGlow.value = 0.45;
        }
      } else {
        obj.root.visible = true;
        gsap.killTweensOf(obj.float.position);
        gsap.killTweensOf(obj.float.scale);
        obj.float.position.set(0, obj.floatBase, 0);
        obj.float.scale.setScalar(1);
        obj.idle = true;
        gsap.to(obj.uniforms.uSilhouette, { value: 0, duration: first ? 0 : 1.2 });
        gsap.to(obj.uniforms.uGlow, { value: 0, duration: first ? 0 : 1.2 });
      }
    }
  }

  // Claim: the object leaves the poster and travels into the bag, then returns as a ghost.
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
      const tl = gsap.timeline({
        onComplete: () => {
          // the ghost settles back into place
          obj.float.position.copy(start);
          obj.float.scale.setScalar(1);
          obj.idle = true;
          obj.setSilhouette(0.94);
          obj.uniforms.uGlow.value = 0.45;
          gsap.fromTo(obj.uniforms.uReveal, { value: -0.1 }, { value: 1.2, duration: 1.6, delay: 0.6, ease: 'power2.inOut' });
          res();
        },
      });
      tl.to(obj.float.position, { y: start.y + obj.height * 0.3 + 0.15, duration: 0.7, ease: 'power2.out' });
      tl.to(obj, { userYaw: obj.userYaw + Math.PI * 1.2, duration: 1.5, ease: 'power2.inOut' }, 0);
      tl.to(obj.float.position, { x: local.x, y: local.y, z: local.z, duration: 0.85, ease: 'power3.in' }, 0.62);
      tl.to(obj.float.scale, { x: 0.05, y: 0.05, z: 0.05, duration: 0.85, ease: 'power3.in' }, 0.62);
      tl.set(obj.uniforms.uReveal, { value: -0.1 });
    });
  }

  applyConfig(id, cfg, animate = true) {
    this.products.get(id)?.applyConfig(cfg, animate);
  }

  // The store points at another object: it brightens at the rim and drifts forward a little.
  setRecommendation(id) {
    for (const [pid, obj] of this.products) {
      if (obj.claimed) continue;
      gsap.to(obj.uniforms.uGlow, { value: pid === id ? 0.9 : 0, duration: 1.2 });
    }
    this.recommended = id;
  }

  // ── the drop ─────────────────────────────────────────────
  setDrop(stateName, charge = 0) {
    this.dropState = stateName;
    const cu = this.eclipse.corona;
    if (stateName === 'locked') {
      const flicker = charge > 0 && charge < 1 && Math.random() < 0.06 ? 0.4 : 1;
      cu.uCharge.value = (0.12 + charge * 0.55) * flicker;
      for (const p of productsIn('afterdark')) this.products.get(p.id)?.setSilhouette(1);
    } else if (!this.revealing) {
      cu.uCharge.value = 0.75;
    }
  }

  async revealDrop() {
    this.revealing = true;
    const cu = this.eclipse.corona;
    // silence
    await new Promise((r) => gsap.to(this, { dim: 0.96, duration: 0.5, onComplete: r }));
    await new Promise((r) => setTimeout(r, 1300));
    this.dropState = 'revealed';
    gsap.fromTo(cu.uFlare, { value: 1 }, { value: 0, duration: 3.2, ease: 'power2.out' });
    gsap.to(cu.uCharge, { value: 0.75, duration: 1.5 });
    this.bloomLocked = true;
    gsap.fromTo(this.bloom, { strength: 2.4 }, { strength: PALETTES.eclipse.bloom, duration: 3.4, onComplete: () => (this.bloomLocked = false) });
    for (const p of productsIn('afterdark')) {
      const obj = this.products.get(p.id);
      if (!obj) continue;
      obj.setSilhouette(obj.claimed ? 0.94 : 0);
      obj.setReveal(-0.1);
      gsap.to(obj.uniforms.uReveal, { value: 1.2, duration: 2.4, delay: 0.4 + p.slot * 0.35, ease: 'power2.inOut' });
    }
    gsap.to(this, { dim: 0, duration: 2.2, ease: 'power2.inOut' });
    this.revealing = false;
  }

  // ── confirmation void ────────────────────────────────────
  async showVoid(item) {
    await this.ready;
    const src = this.products.get(item.id);
    if (!src) return;
    const pal = PALETTES[worldById[src.product.zone].theme];
    this.voidScene = new THREE.Scene();
    this.voidScene.background = new THREE.Color(0x000000);
    this.voidScene.environment = this.scene.environment;
    this.voidScene.environmentIntensity = 0.5;
    const key = new THREE.SpotLight(pal.key, 70, 20, 0.5, 0.9, 1.4);
    key.position.set(2, 6, 4);
    const rim = new THREE.DirectionalLight(pal.rim, 2.2);
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
    return src ? this.thumbs.render(src, cfg) : null;
  }

  // ── projection helpers for the DOM layer ─────────────────
  project(v3) {
    const p = v3.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  productLabelPoint(id, below = false) {
    const obj = this.products.get(id);
    if (!obj) return null;
    const p = obj.centerWorld(new THREE.Vector3());
    p.y += (obj.height * 0.5 + 0.12) * obj.root.scale.y * (below ? -1 : 1);
    return this.project(p);
  }

  anchorScreen(anchor) {
    const p = anchor.getWorldPosition(new THREE.Vector3());
    const res = this.project(p);
    const n = anchor.userData.normal.clone().transformDirection(anchor.parent.matrixWorld);
    res.facing = n.dot(this.camera.position.clone().sub(p).normalize()) > -0.15;
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
        this.zoom = THREE.MathUtils.clamp(pinch.zoom * (pinch.d / Math.hypot(a.x - b.x, a.y - b.y)), 0.45, 1.5);
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down.moved = Math.max(down.moved, Math.hypot(dx, dy));
      if (this.mode === 'inspect' && this.inspected && down.moved > 4) {
        this.inspected.userYaw = down.yaw + dx * 0.008;
        this.inspected.targetPitch = THREE.MathUtils.clamp(down.pitch + dy * 0.004, -0.5, 0.7);
        this.lastInteraction = performance.now();
        this.handlers.onDrag?.();
      }
      if (this.mode === 'poster' && this.heroOf() && down.moved > 4 && e.pointerType === 'mouse') {
        // drag the hero around in the poster too
        const hero = this.products.get(this.heroOf());
        if (hero) hero.userYaw = down.yaw + dx * 0.006;
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
      if (d.moved < 6 && performance.now() - d.t < 600) this.#click();
      else if (e.pointerType !== 'mouse') this.handlers.onSwipe?.(dx, dy, this.mode);
      if (this.mode === 'poster') {
        const hero = this.products.get(this.heroOf());
        if (hero) gsap.to(hero, { userYaw: 0, duration: 1.6, ease: 'power3.out' });
      }
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'inspect') return;
        e.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), 0.45, 1.5);
        this.lastInteraction = performance.now();
      },
      { passive: false },
    );
  }

  #pickables() {
    const list = [];
    const lay = this.layout.get(this.worldId);
    if (!lay) return list;
    for (const id of Object.values(lay)) {
      const obj = this.products.get(id);
      if (!obj?.root.visible) continue;
      if (obj.product.zone === 'afterdark' && this.dropState !== 'revealed') continue;
      list.push(...obj.meshes);
    }
    return list;
  }

  #hit() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.worldId === 'afterdark') {
      const s = this.raycaster.intersectObject(this.eclipse.secretHit, false);
      if (s.length) return { secret: true };
    }
    const hits = this.raycaster.intersectObjects(this.#pickables(), false);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.product) o = o.parent;
    if (!o) return null;
    const p = o.userData.product;
    return { product: p, hero: this.heroOf(p.zone) === p.id };
  }

  #click() {
    if (this.mode !== 'poster' && this.mode !== 'inspect') return;
    const h = this.#hit();
    if (this.mode === 'inspect') return;
    if (h?.secret) this.handlers.onSecret?.();
    else if (h?.product) this.handlers.onPick?.(h.product, h.hero);
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

    const cam = this.camera;
    const target = this.cam.target;
    const par = this.mode === 'inspect' ? 0.1 : this.mode === 'poster' ? 0.35 : 0.2;
    const pos = this.cam.pos.clone().add(new THREE.Vector3(px * par, py * par * 0.4, 0));
    if (this.inspected && (this.mode === 'inspect' || this.mode === 'travel')) pos.sub(target).multiplyScalar(this.zoom).add(target);
    cam.position.copy(pos);
    cam.lookAt(target.x + px * par * 0.15, target.y + py * par * 0.08, target.z);
    this.sky.position.copy(cam.position);

    this.#applyPalette(false);
    const exposure = this.exposureBase * (this.introExposure ?? 1) * (1 - (this.dim || 0)) * (1 - (this.blackout || 0));
    this.renderer.toneMappingExposure = exposure;
    this.sky.material.uniforms.uTime.value = t;

    // lights sit relative to the camera's world so every poster is lit the same way
    const wx = cam.position.x;
    this.key.position.set(wx - 6, 9, 7);
    this.key.target.position.set(wx, 0.8, 0);
    this.rim.position.set(wx + 5, 1.6, -7);
    this.rim.target.position.set(wx, 1, 0);

    // hover
    if ((this.mode === 'poster' || this.mode === 'inspect') && matchMedia('(hover: hover)').matches) {
      const h = this.mode === 'poster' ? this.#hit() : null;
      const key = h?.secret ? 'secret' : h?.product?.id || null;
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.handlers.onHover?.(h);
      }
    } else if (this.hoverKey) {
      this.hoverKey = null;
      this.handlers.onHover?.(null);
    }

    // a light that follows your hand
    this.raycaster.setFromCamera(this.pointerSmooth, cam);
    const focusZ = this.inspected ? this.inspected.centerWorld(_v).z + 1 : 1.6;
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(_plane.set(_zAxis, -focusZ), hit)) {
      hit.y = THREE.MathUtils.clamp(hit.y, 0.6, 4);
      this.cursorLight.position.lerp(hit, 1 - Math.exp(-dt * 6));
      for (const [, env] of this.envs) env.motes?.material.uniforms.uMouse.value.copy(hit);
    }
    const wantCursor = this.mode === 'arrival' || this.focused ? 0 : this.inspected ? 2.5 : 5;
    this.cursorLight.color.copy(this.palette.key);
    this.cursorLight.intensity += (wantCursor - this.cursorLight.intensity) * k;

    // environments near the camera are alive, the rest sleep
    for (const [, env] of this.envs) {
      const near = Math.abs(env.world.x - cam.position.x) < 60;
      env.group.visible = near;
      if (near) env.update(dt, t);
    }

    // objects turn toward you
    for (const [, obj] of this.products) {
      const near = Math.abs(obj.root.position.x - cam.position.x) < 30;
      obj.root.visible = near && obj.root.scale.x > 0.001;
      if (!obj.root.visible) continue;
      if (obj !== this.inspected) {
        const hero = obj.spot === 'hero';
        obj.targetYaw = (obj.product.yaw || 0) + px * (hero ? 0.45 : 0.25) + Math.sin(t * 0.3 + obj.root.position.x) * (hero ? 0.12 : 0.3);
        obj.targetPitch = -py * (hero ? 0.06 : 0.1);
      } else if (performance.now() - this.lastInteraction > 5000 && this.mode === 'inspect') {
        obj.userYaw += dt * 0.12;
      }
      obj.update(dt, t, cam);
    }
    if (this.monument?.root.visible) {
      this.monument.targetYaw = -0.4 + t * 0.015 + px * 0.04;
      this.monument.update(dt, t, cam);
    }
    if (this.voidObj) {
      this.voidObj.targetYaw = t * 0.35;
      this.voidObj.update(dt, t, this.voidCam);
    }

    this.grade.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}

const _v = new THREE.Vector3();
const _plane = new THREE.Plane();
const _zAxis = new THREE.Vector3(0, 0, 1);
