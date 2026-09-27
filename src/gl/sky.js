// A gradient sky dome with a sun glare and slow, soft cloud banks.
import * as THREE from 'three';

export const NOISE = /* glsl */ `
float n_hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n_noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(n_hash(i), n_hash(i + vec2(1, 0)), u.x), mix(n_hash(i + vec2(0, 1)), n_hash(i + vec2(1, 1)), u.x), u.y);
}
float n_fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * n_noise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBelow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 0.3, -1) },
      uSunColor: { value: new THREE.Color() },
      uSun: { value: 1 },
      uCloud: { value: 0.5 },
      uTime: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uBelow, uSunColor, uSunDir;
      uniform float uSun, uCloud, uTime, uFade;
      varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uTop, smoothstep(0.22, 0.75, h));
        col = mix(col, uBelow, smoothstep(0.0, -0.12, h));
        // clouds: soft banks drifting just above the horizon
        vec2 cp = d.xz / max(h + 0.12, 0.05) * 0.9 + vec2(uTime * 0.004, 0.0);
        float c = smoothstep(0.45, 0.85, n_fbm(cp * 1.4)) * smoothstep(-0.02, 0.12, h) * smoothstep(0.7, 0.2, h);
        col = mix(col, mix(uHorizon, vec3(1.0), 0.35), c * uCloud * 0.55);
        // sun glare
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 60.0) * 0.45 + pow(s, 6.0) * 0.18) * uSun;
        // horizon haze band
        col += uHorizon * exp(-abs(h) * 28.0) * 0.12;
        gl_FragColor = vec4(col * uFade, 1.0);
      }`,
  });
}

export function applyPaletteToSky(mat, p) {
  const u = mat.uniforms;
  u.uTop.value.copy(p.top);
  u.uMid.value.copy(p.mid);
  u.uHorizon.value.copy(p.horizon);
  u.uBelow.value.copy(p.below);
  u.uSunDir.value.copy(p.sunDir);
  u.uSunColor.value.copy(p.sunColor);
  u.uSun.value = p.sun;
  u.uCloud.value = p.cloud;
}
