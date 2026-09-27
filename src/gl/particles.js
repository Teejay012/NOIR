// Floating dust. It drifts slowly and parts around the cursor.
import * as THREE from 'three';

export class Particles {
  constructor(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -14 + Math.random() * 100;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = -34 + Math.random() * 50;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector3(0, -100, 0) },
        uOpacity: { value: 1 },
        uPixel: { value: Math.min(devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uMouse; uniform float uPixel;
        attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.04 + aSeed * 0.08), 9.0);
          p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.3;
          p.z += cos(uTime * 0.17 + aSeed * 20.0) * 0.3;
          vec3 d = p - uMouse;
          float dist = length(d);
          p += normalize(d + 1e-4) * smoothstep(2.2, 0.0, dist) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + aSeed * 2.2) * uPixel * (7.0 / -mv.z);
          float near = smoothstep(2.6, 0.2, dist);
          vA = (0.18 + 0.5 * aSeed) * (0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0)) + near * 0.6;
          vA *= smoothstep(45.0, 6.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), a * vA * uOpacity);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  setMouse(v) {
    this.material.uniforms.uMouse.value.lerp(v, 0.2);
  }

  update(dt, t) {
    this.material.uniforms.uTime.value = t;
  }
}
