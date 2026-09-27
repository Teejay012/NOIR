// Patches the PBR materials of a generated product so the object itself can transform:
//  • uTint / uPrevTint + uSweep  → a colour change that travels up the object as a bright scan line
//  • uTintMix                    → how strongly the tint replaces the baked texture (keeps texture detail)
//  • uReveal                     → materialise from the floor up (arrival, drop reveal)
//  • uSilhouette                 → collapse to a pure black silhouette (drop is locked)
//  • uGlow                       → faint rim glow when the store recommends the object
import * as THREE from 'three';

export function createProductUniforms() {
  return {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uPrevTint: { value: new THREE.Color(1, 1, 1) },
    uTintMix: { value: 0 },
    uPrevTintMix: { value: 0 },
    uAvgLum: { value: 0.6 },
    uSweep: { value: 1.5 },
    uReveal: { value: 1.2 },
    uSilhouette: { value: 0 },
    uGlow: { value: 0 },
    uRootInv: { value: new THREE.Matrix4() },
    uBoundsMin: { value: new THREE.Vector3() },
    uBoundsMax: { value: new THREE.Vector3(1, 1, 1) },
    uTime: { value: 0 },
  };
}

const VERT_HEAD = /* glsl */ `
uniform mat4 uRootInv;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
varying vec3 vRootN;
`;
const VERT_BODY = /* glsl */ `
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec3 rp = (uRootInv * wp).xyz;
  vRootN = (rp - uBoundsMin) / max(uBoundsMax - uBoundsMin, vec3(1e-4));
}
`;

const FRAG_HEAD = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uPrevTint;
uniform float uTintMix;
uniform float uPrevTintMix;
uniform float uAvgLum;
uniform float uSweep;
uniform float uReveal;
uniform float uSilhouette;
uniform float uGlow;
uniform float uTime;
varying vec3 vRootN;
float nHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// runs right after the albedo texture has been sampled
const FRAG_TINT = /* glsl */ `
float nH = vRootN.y;
// materialise from the floor up
float revealEdge = uReveal + (nHash(floor(vRootN.xz * 40.0)) - 0.5) * 0.04;
if (nH > revealEdge) discard;
float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float detail = clamp(lum / max(uAvgLum, 0.05), 0.35, 1.6);
bool above = nH > uSweep;
vec3 tint = above ? uPrevTint : uTint;
float tintMix = above ? uPrevTintMix : uTintMix;
diffuseColor.rgb = mix(diffuseColor.rgb, tint * detail, tintMix);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), uSilhouette);
`;

const FRAG_EMISSIVE = /* glsl */ `
{
  float sweepLine = smoothstep(0.035, 0.0, abs(vRootN.y - uSweep));
  float revealLine = smoothstep(0.03, 0.0, abs(vRootN.y - uReveal)) * step(uReveal, 1.0);
  totalEmissiveRadiance += vec3(0.95, 0.93, 0.9) * (sweepLine * 1.6 + revealLine * 2.2);
  float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += vec3(0.9, 0.88, 0.84) * fres * (uGlow * 0.9 + uSilhouette * 0.22);
}
`;

export function patchMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_TINT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`);
  };
  material.customProgramCacheKey = () => 'noir-product';
  material.needsUpdate = true;
}

// Average luminance of a texture, so the tint can keep texture detail at a consistent brightness.
export function averageLuminance(texture) {
  const img = texture?.image;
  if (!img || !img.width) return 0.6;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const r = (d[i] / 255) ** 2.2;
      const g = (d[i + 1] / 255) ** 2.2;
      const b = (d[i + 2] / 255) ** 2.2;
      sum += r * 0.299 + g * 0.587 + b * 0.114;
      n++;
    }
    return n ? Math.max(0.05, sum / n) : 0.6;
  } catch {
    return 0.6;
  }
}
