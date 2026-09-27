// Colour grades for each world. The camera blends between them as it travels,
// so moving from one collection to the next feels like the light itself changing.
import * as THREE from 'three';

const RAW = {
  canyon: {
    top: '#0e2730', mid: '#5b8288', horizon: '#e6ebe4', below: '#8b877c',
    sunDir: [-0.5, 0.3, -0.8], sunColor: '#fff2da', sun: 1, cloud: 0.6,
    fog: '#a9b8b3', fogDensity: 0.02,
    floor: '#5a4c40', floorRough: 0.95,
    hemiSky: '#d2e2e1', hemiGround: '#4a3c30', hemi: 0.7,
    key: '#fff0da', keyInt: 2.6, rim: '#c4e4ff', rimInt: 1.3,
    exposure: 1, env: 0.95, bloom: 0.3, floorEnv: 0.5, pool: '#fff4e2', poolInt: 0.35,
  },
  velvet: {
    top: '#010309', mid: '#06102c', horizon: '#172c66', below: '#040919',
    sunDir: [0, 0.85, -0.5], sunColor: '#d3ad73', sun: 0.12, cloud: 0,
    fog: '#07112d', fogDensity: 0.045,
    floor: '#0a1331', floorRough: 0.32,
    hemiSky: '#3b5aa3', hemiGround: '#040817', hemi: 0.45,
    key: '#ffd8a0', keyInt: 3.4, rim: '#7494ea', rimInt: 1.5,
    exposure: 1.1, env: 0.6, bloom: 0.5, floorEnv: 0.6, pool: '#ffd49a', poolInt: 0.7,
  },
  bluehour: {
    top: '#050d18', mid: '#1d3450', horizon: '#c68897', below: '#0a121f',
    sunDir: [0.25, 0.04, -1], sunColor: '#ffb0a4', sun: 0.55, cloud: 0.4,
    fog: '#22324b', fogDensity: 0.024,
    floor: '#04070c', floorRough: 0.42,
    hemiSky: '#6e90c2', hemiGround: '#0a1019', hemi: 0.55,
    key: '#e2ecff', keyInt: 2.3, rim: '#ff9fb2', rimInt: 1.8,
    exposure: 1.05, env: 0.75, bloom: 0.6, floorEnv: 0.18, pool: '#a8c7ff', poolInt: 0.55,
  },
  eclipse: {
    top: '#000000', mid: '#030202', horizon: '#1e0c05', below: '#020101',
    sunDir: [0, 0.2, -1], sunColor: '#ff6a2b', sun: 0, cloud: 0,
    fog: '#070302', fogDensity: 0.03,
    floor: '#050404', floorRough: 0.16,
    hemiSky: '#43200f', hemiGround: '#000000', hemi: 0.3,
    key: '#ffc39c', keyInt: 1.5, rim: '#ff6a2b', rimInt: 2.8,
    exposure: 1, env: 0.35, bloom: 0.85, floorEnv: 0.5, pool: '#ff7336', poolInt: 0.6,
  },
  sediment: {
    top: '#0b0805', mid: '#2e2116', horizon: '#a07b53', below: '#191009',
    sunDir: [0.35, 0.6, -0.7], sunColor: '#ffd7a2', sun: 0.4, cloud: 0.25,
    fog: '#3e2d1d', fogDensity: 0.038,
    floor: '#21170f', floorRough: 0.7,
    hemiSky: '#caa478', hemiGround: '#1a110a', hemi: 0.55,
    key: '#ffdcac', keyInt: 2.8, rim: '#ffae6c', rimInt: 1.3,
    exposure: 1, env: 0.65, bloom: 0.45, floorEnv: 0.4, pool: '#ffd6a0', poolInt: 0.5,
  },
};

const COLOR_KEYS = ['top', 'mid', 'horizon', 'below', 'sunColor', 'fog', 'floor', 'hemiSky', 'hemiGround', 'key', 'rim', 'pool'];

function build(raw) {
  const p = { ...raw, sunDir: new THREE.Vector3(...raw.sunDir).normalize() };
  for (const k of COLOR_KEYS) p[k] = new THREE.Color(raw[k]);
  return p;
}

export const PALETTES = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, build(v)]));

// out = mix(a, b, t) for every field
export function blendPalette(out, a, b, t) {
  for (const k in a) {
    const va = a[k];
    const vb = b[k];
    if (va?.isColor) (out[k] ||= new THREE.Color()).copy(va).lerp(vb, t);
    else if (va?.isVector3) (out[k] ||= new THREE.Vector3()).copy(va).lerp(vb, t).normalize();
    else if (typeof va === 'number') out[k] = va + (vb - va) * t;
  }
  return out;
}

export const clonePalette = (p) => blendPalette({}, p, p, 0);
