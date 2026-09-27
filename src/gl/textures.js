import * as THREE from 'three';

export const FONT_SANS = '"Inter Tight Variable", "Inter Tight", Helvetica, Arial, sans-serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

// Renders text into a transparent canvas texture. Returns { texture, aspect }.
export function textTexture(text, { size = 200, weight = 300, font = FONT_SANS, tracking = -0.02, color = '#ffffff', pad = 0.2 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const f = `${weight} ${size}px ${font}`;
  g.font = f;
  const spacing = tracking * size;
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const w = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  c.width = Math.ceil(w + size * pad * 2);
  c.height = Math.ceil(size * (1 + pad * 2));
  g.font = f;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  let x = size * pad;
  chars.forEach((ch, i) => {
    g.fillText(ch, x, c.height / 2);
    x += widths[i] + spacing;
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: c.width / c.height };
}

export function textPlane(text, height, opts = {}) {
  const { texture, aspect } = textTexture(text, opts);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    fog: opts.fog ?? true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat);
  mesh.userData.aspect = aspect;
  return mesh;
}

export function radialTexture(stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
