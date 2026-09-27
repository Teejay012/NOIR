// The five worlds. Everything here is procedural — geometry and shaders only, no textures —
// so the product assets are the only things that had to be generated.
import * as THREE from 'three';
import { NOISE } from './sky.js';
import { textPlane, radialTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);

// ── shared pieces ──────────────────────────────────────────────
function rockGeometry(detail = 1, rough = 0.28) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const seed = Math.random() * 100;
  const cut = new THREE.Vector3(rand(-1, 1), rand(-0.2, 0.6), rand(-1, 1)).normalize();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let n = 0;
    let f = 1.6;
    let a = 1;
    for (let o = 0; o < 4; o++) {
      n += Math.sin(v.x * f + seed) * Math.cos(v.y * f * 1.13 - seed * 0.7) * Math.sin(v.z * f * 0.91 + seed * 1.3) * a;
      f *= 2.1;
      a *= 0.48;
    }
    // one flat fracture face, like split stone
    const d = v.dot(cut);
    const flat = d > 0.55 ? (d - 0.55) * 0.8 : 0;
    v.multiplyScalar(1 + n * rough - flat);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A drifting cloud of points: dust, gold motes, embers.
function motes({ count, box, color, size = 1.6, rise = 0.12, additive = true, opacity = 1 }) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(box[0], box[1]);
    pos[i * 3 + 1] = rand(box[2], box[3]);
    pos[i * 3 + 2] = rand(box[4], box[5]);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size * Math.min(devicePixelRatio, 2) },
      uRise: { value: rise },
      uH: { value: box[3] - box[2] },
      uY0: { value: box[2] },
      uOpacity: { value: opacity },
      uMouse: { value: new THREE.Vector3(0, -99, 0) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uRise, uH, uY0; uniform vec3 uMouse;
      attribute float aSeed; varying float vA;
      void main(){
        vec3 p = position;
        p.y = uY0 + mod(p.y - uY0 + uTime * uRise * (0.4 + aSeed), uH);
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.35;
        p.z += cos(uTime * 0.23 + aSeed * 30.0) * 0.35;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec3 d = wp.xyz - uMouse;
        float md = length(d);
        wp.xyz += normalize(d + 1e-4) * smoothstep(2.0, 0.0, md) * 0.8;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + aSeed * 1.4) * (8.0 / -mv.z);
        float edge = smoothstep(0.0, 0.15, (p.y - uY0) / uH) * smoothstep(1.0, 0.8, (p.y - uY0) / uH);
        vA = edge * (0.35 + 0.65 * sin(uTime * (0.8 + aSeed) + aSeed * 50.0) * 0.5 + 0.35) + smoothstep(2.4, 0.0, md) * 0.5;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, d) * vA * uOpacity);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// A soft cone of light falling from above.
function beam(color, radiusTop, radiusBottom, height, opacity) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 48, 1, true);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `varying float vY; varying float vF;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying float vY; varying float vF;
      void main(){ gl_FragColor = vec4(uColor, pow(1.0 - vY, 1.8) * pow(vF, 2.2) * uOpacity); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = height / 2;
  return m;
}

function pool(color, size, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  return m;
}

// Layered ridge-line silhouettes with atmospheric perspective.
function ridge({ width, height, color, haze, seed, freq, amp, base, terrace = 0 }) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHaze: { value: new THREE.Color(haze) },
      uSeed: { value: seed },
      uFreq: { value: freq },
      uAmp: { value: amp },
      uBase: { value: base },
      uTerrace: { value: terrace },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uHaze; uniform float uSeed, uFreq, uAmp, uBase, uTerrace; varying vec2 vUv;
      ${NOISE}
      void main(){
        float n = n_fbm(vec2(vUv.x * uFreq + uSeed, uSeed)) + (n_fbm(vec2(vUv.x * uFreq * 7.0, uSeed + 3.0)) - 0.5) * 0.12;
        n = mix(n, smoothstep(0.35, 0.65, n) * 0.6 + n * 0.4, uTerrace);
        float h = uBase + n * uAmp;
        float a = smoothstep(h + 0.003, h - 0.003, vUv.y) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        if (a < 0.01) discard;
        // strata lines and haze toward the base
        float strata = 0.93 + 0.07 * sin(vUv.y * 90.0 + n_fbm(vUv * vec2(4.0, 20.0)) * 9.0);
        float grain = 0.72 + 0.56 * n_fbm(vUv * vec2(60.0, 60.0)) * n_fbm(vUv * vec2(9.0, 5.0) + 2.0);
        float crest = smoothstep(h - 0.12, h, vUv.y);
        vec3 col = uColor * strata * grain * (0.75 + crest * 0.6);
        col = mix(col, uHaze, smoothstep(h, 0.0, vUv.y) * 0.45);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return m;
}

// ── 01 MOTION — a canyon at first light, rocks lifting off the ground ──────
export function canyon() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 1, metalness: 0, envMapIntensity: 0.35 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x1d1916, roughness: 1, envMapIntensity: 0.3 });

  const layers = [
    { z: -150, y: 12, width: 520, height: 70, color: '#9fb0ad', haze: '#dfe6e0', seed: 3, freq: 3, amp: 0.55, base: 0.2 },
    { z: -95, y: 6, width: 340, height: 40, color: '#7a746b', haze: '#bfc9c4', seed: 11, freq: 3, amp: 0.55, base: 0.2, terrace: 0.3 },
    { z: -55, y: 2, width: 220, height: 22, color: '#4a3e34', haze: '#8f928b', seed: 23, freq: 3, amp: 0.4, base: 0.1, terrace: 0.35 },
  ];
  for (const [i, l] of layers.entries()) {
    const r = ridge(l);
    r.position.set(0, l.y, l.z);
    r.renderOrder = -10 + i;
    g.add(r);
  }
  // canyon walls closing in on both sides
  for (const side of [-1, 1]) {
    const wall = ridge({ width: 70, height: 34, color: '#6a5140', haze: '#9a968c', seed: side * 7 + 40, freq: 3.5, amp: 0.5, base: 0.4, terrace: 0.2 });
    wall.position.set(side * 30, 15, -30);
    wall.rotation.y = -side * 0.95;
    g.add(wall);
  }
  // the ground is scattered with stone
  for (let i = 0; i < 22; i++) {
    const r = new THREE.Mesh(rockGeometry(3, 0.22), Math.random() > 0.5 ? stone : stoneDark);
    const far = Math.random();
    const s = rand(0.3, 1.4) * (1 + far * 1.5);
    r.scale.set(s * rand(1, 1.8), s * rand(0.5, 0.9), s * rand(1, 1.6));
    const side = Math.random() > 0.5 ? 1 : -1;
    r.position.set(side * rand(3.2, 16 + far * 10), s * 0.25, rand(-4, -26 * far - 4));
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(r);
  }
  // two boulders in the foreground, half out of frame
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(rockGeometry(4, 0.2), stoneDark);
    b.scale.set(2.6, 1.5, 2);
    b.position.set(side * 6.2, 0.1, 2.6);
    b.rotation.y = side;
    g.add(b);
  }
  // the slab the hero floats above
  const slab = new THREE.Mesh(rockGeometry(4, 0.1), stone);
  slab.scale.set(1.15, 0.3, 0.9);
  slab.position.y = 0.1;
  g.add(slab);
  g.add(pool('#fff2dc', 6, 0.25));

  // debris lifting off the ground, the store's gravity switched off
  const COUNT = 150;
  const debrisGeo = rockGeometry(1, 0.3);
  const debris = new THREE.InstancedMesh(debrisGeo, stoneDark, COUNT);
  const state = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < COUNT; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(1.2, 7.5);
    state.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r * 0.7 - 1.5,
      y: rand(-0.5, 9),
      s: rand(0.015, 0.09) * (Math.random() > 0.93 ? 2.6 : 1),
      v: rand(0.05, 0.22),
      rx: rand(0, 6),
      ry: rand(0, 6),
      w: rand(-0.6, 0.6),
    });
  }
  debris.frustumCulled = false;
  g.add(debris);

  const dust = motes({ count: 500, box: [-12, 12, 0, 8, -10, 5], color: '#fff6e6', size: 1.4, rise: 0.08, opacity: 0.55 });
  g.add(dust);

  return {
    group: g,
    heroY: 0.4,
    heroLift: 0.42,
    motes: dust,
    update(dt, t) {
      for (let i = 0; i < COUNT; i++) {
        const d = state[i];
        d.y += d.v * dt;
        if (d.y > 9) d.y = -0.3;
        d.rx += d.w * dt;
        d.ry += d.w * 0.7 * dt;
        e.set(d.rx, d.ry, 0);
        q.setFromEuler(e);
        const s = d.s * THREE.MathUtils.smoothstep(d.y, -0.3, 0.6);
        m4.compose(new THREE.Vector3(d.x + Math.sin(t * 0.2 + i) * 0.1, d.y, d.z), q, new THREE.Vector3(s, s * 0.8, s));
        debris.setMatrixAt(i, m4);
      }
      debris.instanceMatrix.needsUpdate = true;
      dust.material.uniforms.uTime.value = t;
    },
  };
}

// ── 02 FORM — navy velvet, a gold-rimmed plinth, a single warm light ──────
export function velvet() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshPhysicalMaterial({
    color: 0x0b1a46,
    roughness: 0.62,
    sheen: 1,
    sheenColor: new THREE.Color('#5b7fd6'),
    sheenRoughness: 0.32,
    side: THREE.DoubleSide,
  });
  const drapes = [];
  const drape = (w, h, x, z, ry, folds, phase) => {
    const geo = new THREE.PlaneGeometry(w, h, 90, 40);
    const m = new THREE.Mesh(geo, cloth);
    m.position.set(x, h / 2 - 0.2, z);
    m.rotation.y = ry;
    g.add(m);
    drapes.push({ m, base: Float32Array.from(geo.attributes.position.array), w, h, folds, phase });
  };
  drape(18, 12, 0, -7.5, 0, 9, 0);
  drape(7, 12, -6.6, -2.8, 0.95, 5, 1.7);
  drape(7, 12, 6.6, -2.8, -0.95, 5, 3.1);

  // plinth
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x0a1330, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.25, metalness: 1 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.5, 96), lacquer);
  plinth.position.y = 0.25;
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.012, 12, 160), gold);
  rimTop.rotation.x = Math.PI / 2;
  rimTop.position.y = 0.5;
  const rimBase = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.008, 12, 160), gold);
  rimBase.rotation.x = Math.PI / 2;
  rimBase.position.y = 0.02;
  g.add(plinth, rimTop, rimBase);
  const b = beam('#ffd8a0', 0.3, 1.6, 9, 0.06);
  g.add(b, pool('#ffcf8f', 5.5, 0.55));

  const dust = motes({ count: 420, box: [-7, 7, 0, 8, -6, 4], color: '#e9c48a', size: 1.2, rise: 0.05, opacity: 0.8 });
  g.add(dust);

  return {
    group: g,
    heroY: 0.5,
    heroLift: 0.16,
    motes: dust,
    update(dt, t) {
      for (const d of drapes) {
        const pos = d.m.geometry.attributes.position;
        const a = pos.array;
        for (let i = 0; i < pos.count; i++) {
          const x = d.base[i * 3];
          const y = d.base[i * 3 + 1];
          const v = 1 - (y / d.h + 0.5); // 0 top → 1 bottom
          const u = x / d.w;
          const fold =
            Math.sin(u * d.folds * Math.PI * 2 + d.phase + Math.sin(t * 0.35 + v * 2) * 0.35) * (0.18 + v * 0.35) +
            Math.sin(u * d.folds * 5.3 + d.phase * 2 + t * 0.5) * 0.04 * v;
          a[i * 3 + 2] = fold;
        }
        pos.needsUpdate = true;
        d.m.geometry.computeVertexNormals();
      }
      dust.material.uniforms.uTime.value = t;
    },
  };
}

// ── 03 OBJECTS — blue hour over a city, a turntable and orbiting glass arcs ──
export function bluehour() {
  const g = new THREE.Group();
  // skyline
  const COUNT = 260;
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const size = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const city = new THREE.InstancedMesh(
    box,
    new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uFog: { value: new THREE.Color('#2a3b56') }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aSize; attribute float aSeed;
        varying vec2 vUv; varying vec3 vN; varying vec3 vSize; varying float vSeed; varying float vDepth;
        void main(){
          vUv = uv; vN = normal; vSize = aSize; vSeed = aSeed;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog; uniform float uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vSize; varying float vSeed; varying float vDepth;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 91.7) * 43758.5453); }
        void main(){
          vec3 col = vec3(0.028, 0.045, 0.07);
          if (abs(vN.y) < 0.5) {
            float faceW = abs(vN.x) > 0.5 ? vSize.z : vSize.x;
            vec2 g = vUv * vec2(faceW, vSize.y) * vec2(2.6, 3.4);
            vec2 c = floor(g); vec2 f = fract(g);
            float win = smoothstep(0.18, 0.28, f.x) * smoothstep(0.82, 0.72, f.x) * smoothstep(0.25, 0.35, f.y) * smoothstep(0.75, 0.65, f.y);
            float lit = step(0.78, h(c)) * step(0.35, h(floor(c / vec2(3.0, 4.0)) + 11.0));
            float flick = 0.85 + 0.15 * sin(uTime * (0.5 + h(c + 3.0)) + h(c) * 30.0);
            vec3 wc = mix(vec3(1.0, 0.82, 0.6), vec3(0.72, 0.84, 1.0), h(c + 7.0));
            col += win * lit * wc * 0.55 * flick;
            col *= 0.8 + 0.2 * vUv.y;
          }
          col = mix(col, uFog, smoothstep(25.0, 110.0, vDepth) * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
    COUNT,
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < COUNT; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * rand(4, 70) * (Math.random() > 0.25 ? 1 : 0.3);
    const z = rand(-26, -95);
    const w = rand(2, 6);
    const d = rand(2, 6);
    const hgt = rand(4, 16) * (1 + Math.max(0, 1 - Math.abs(x) / 40)) * (Math.random() > 0.9 ? 2.2 : 1);
    m4.compose(new THREE.Vector3(x, -0.2, z), new THREE.Quaternion(), new THREE.Vector3(w, hgt, d));
    city.setMatrixAt(i, m4);
    size[i * 3] = w;
    size[i * 3 + 1] = hgt;
    size[i * 3 + 2] = d;
    seed[i] = Math.random();
  }
  city.geometry = box.clone();
  city.geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3));
  city.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  city.frustumCulled = false;
  g.add(city);

  // turntable
  const black = new THREE.MeshPhysicalMaterial({ color: 0x07090d, roughness: 0.15, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.14, 96), black);
  top.position.y = 0.19;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 0.12, 64), black);
  base.position.y = 0.06;
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.6, 2.2), toneMapped: false });
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1.225, 0.006, 8, 180), ringMat);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.26;
  const wide = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.62, 180), new THREE.MeshBasicMaterial({ color: 0x9db8e6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  wide.rotation.x = -Math.PI / 2;
  wide.position.y = 0.01;
  g.add(top, base, edge, wide, pool('#a8c6ff', 6, 0.35));

  // glass arcs orbiting the object
  const arcs = [];
  const arcMat = (o) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.25, 1.4), transparent: true, opacity: o, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const arcDefs = [
    { r: 1.35, tube: 0.006, arc: Math.PI * 1.1, y: 1.5, rx: 1.35, o: 0.8, s: 0.12 },
    { r: 3.4, tube: 0.012, arc: Math.PI * 0.9, y: 1.4, rx: 1.45, o: 0.35, s: -0.05 },
    { r: 5.2, tube: 0.018, arc: Math.PI * 0.7, y: 1.8, rx: 1.5, o: 0.22, s: 0.03 },
  ];
  for (const a of arcDefs) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(a.r, a.tube, 8, 200, a.arc), arcMat(a.o));
    m.position.y = a.y;
    m.rotation.x = a.rx;
    g.add(m);
    arcs.push({ m, s: a.s });
  }
  const dust = motes({ count: 380, box: [-9, 9, 0, 7, -8, 4], color: '#bcd4ff', size: 1.1, rise: 0.04, opacity: 0.6 });
  g.add(dust);

  return {
    group: g,
    heroY: 0.26,
    heroLift: 0.3,
    motes: dust,
    update(dt, t) {
      for (const a of arcs) a.m.rotation.z += a.s * dt;
      top.rotation.y += dt * 0.1;
      city.material.uniforms.uTime.value = t;
      dust.material.uniforms.uTime.value = t;
    },
  };
}

// ── 04 AFTER DARK — an eclipse. The drop is locked until the corona ignites ──
export function eclipse() {
  const g = new THREE.Group();
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uCharge: { value: 0.2 }, uTime: { value: 0 }, uFlare: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uCharge, uTime, uFlare; varying vec2 vUv;
        ${NOISE}
        void main(){
          vec2 p = (vUv - 0.5) * 44.0;
          float d = length(p);
          float a = atan(p.y, p.x);
          float R = 6.0;
          float rays = n_fbm(vec2(a * 3.0, uTime * 0.08)) * 0.8 + n_fbm(vec2(a * 11.0, uTime * 0.05 + 4.0)) * 0.4;
          float spread = 0.3 + uCharge * (0.9 + rays * 2.2) + uFlare * 4.0;
          float ring = exp(-pow(max(d - R, 0.0) / spread, 1.25)) * step(R - 0.02, d);
          float inner = exp(-pow((d - R) / 0.12, 2.0));
          vec3 ember = vec3(1.0, 0.36, 0.1);
          vec3 pale = vec3(1.0, 0.82, 0.62);
          vec3 col = mix(ember, pale, ring * ring) * ring * (0.25 + uCharge * 0.9 + uFlare * 1.6);
          col += pale * inner * (0.4 + uCharge * 1.1);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  corona.position.set(0, 7.5, -34);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 128), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  disc.position.set(0, 7.5, -33.9);
  g.add(corona, disc);
  // the corona, reflected in a black lacquer floor
  const reflect = pool('#ff6a2b', 22, 0.25);
  reflect.scale.set(0.7, 1.6, 1);
  reflect.position.z = -8;
  g.add(reflect, pool('#ff8a4d', 4, 0.35));

  const embers = motes({ count: 520, box: [-10, 10, 0, 10, -14, 4], color: '#ff7a3a', size: 1.5, rise: 0.25, opacity: 0.9 });
  g.add(embers);

  // the symbol — tiny, dim, easy to miss
  const secret = textPlane('◈', 0.16, { weight: 300, size: 160, font: 'Arial, sans-serif', opacity: 0.4, pad: 0.1, color: '#ffb088' });
  secret.rotation.x = -Math.PI / 2;
  secret.position.set(5.4, 0.012, 1.6);
  const secretHit = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
  secretHit.rotation.x = -Math.PI / 2;
  secretHit.position.copy(secret.position);
  g.add(secret, secretHit);

  const cu = corona.material.uniforms;
  return {
    group: g,
    heroY: 0,
    heroLift: 0.95,
    motes: embers,
    secret,
    secretHit,
    corona: cu,
    disc,
    update(dt, t) {
      cu.uTime.value = t;
      embers.material.uniforms.uTime.value = t;
      embers.material.uniforms.uOpacity.value = 0.25 + cu.uCharge.value * 0.8;
    },
  };
}

// ── ◈ THE ARCHIVE — sediment and stone, warm dust in slanted light ──────
export function sediment() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = -1.1 + (i / 8) * 2.2;
    const w = rand(1.2, 2.4);
    const h = rand(6, 13);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, rand(0.8, 1.6)), stone);
    m.position.set(Math.sin(a) * 11, h / 2, -Math.cos(a) * 11 - 2);
    m.rotation.y = -a + rand(-0.1, 0.1);
    m.rotation.z = rand(-0.04, 0.04);
    g.add(m);
  }
  const block = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.5), new THREE.MeshStandardMaterial({ color: 0x6b513a, roughness: 0.8 }));
  block.position.y = 0.3;
  g.add(block);
  for (const x of [-4.5, 0, 4.5]) {
    const b = beam('#ffd6a0', 0.2, 1.8, 14, x ? 0.035 : 0.07);
    b.position.x = x;
    b.rotation.z = 0.18;
    g.add(b);
  }
  g.add(pool('#ffd6a0', 6, 0.4));
  const dust = motes({ count: 600, box: [-9, 9, 0, 9, -9, 4], color: '#ffd9a6', size: 1.3, rise: 0.03, opacity: 0.8 });
  g.add(dust);
  return {
    group: g,
    heroY: 0.6,
    heroLift: 0.22,
    motes: dust,
    update(dt, t) {
      dust.material.uniforms.uTime.value = t;
    },
  };
}

export const BUILDERS = { canyon, velvet, bluehour, eclipse, sediment };
