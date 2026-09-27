// NOIR catalogue. Every object in the store is defined here.
// `model` / `image` point at assets generated with Higgsfield (see scripts/assets.json).

const SHOE_SIZES = ['40', '41', '42', '43', '44'];

// Each collection is a world with its own light, palette and poster.
// `x` is where the world sits along the store; the camera travels between them.
export const WORLDS = [
  {
    id: 'motion', index: '01', name: 'MOTION', theme: 'canyon', x: 0,
    kicker: 'CHAPTER 01 — SHOES & MOVEMENT',
    title: 'MOTION',
    line: 'Not the distance you run, but the ground you leave.',
    note: 'Three objects shaped by wind and weight. Engineered knit, composite soles, one-piece forms — made for the ground, built to leave it.',
  },
  {
    id: 'form', index: '02', name: 'FORM', theme: 'velvet', x: 70,
    kicker: 'CHAPTER 02',
    title: 'FORM',
    sub: 'TAILORED OBJECTS',
    line: 'Elegance, cut close to the body.',
    note: 'Outerwear, leather and acetate, finished by hand. Quiet pieces for loud rooms.',
  },
  {
    id: 'objects', index: '03', name: 'OBJECTS', theme: 'bluehour', x: 140,
    kicker: 'Captivating',
    title: 'OBJECTS',
    sub: 'FOR EVERY HOUR',
    line: 'Everyday things, made to be kept.',
    note: 'A vessel, a watch, a sound. The things you touch most, reduced to what matters.',
  },
  {
    id: 'afterdark', index: '04', name: 'AFTER DARK', theme: 'eclipse', x: 210,
    kicker: 'DROP 001 — LIMITED',
    title: 'AFTER DARK',
    line: 'Released only when the light goes out.',
    note: 'Obsidian, molten silver, smoked glass. Numbered pieces, released once.',
  },
  {
    id: 'archive', index: '◈', name: 'THE ARCHIVE', theme: 'sediment', x: 280, hidden: true,
    kicker: '◈ — THE ARCHIVE',
    title: 'ARCHIVE',
    line: 'Not everything is meant to be found.',
    note: 'Prototypes, show pieces and objects that were never released. One of each.',
  },
];
export const worldById = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
// kept for older call sites
export const ZONES = WORLDS.filter((w) => !w.hidden);

const hs = (id, title, text, at, dir, extra = {}) => ({ id, title, text, at, dir, ...extra });

export const PRODUCTS = [
  // ── MOTION ────────────────────────────────────────────────
  {
    id: 'n01', code: 'N-01', name: 'Runner', zone: 'motion', slot: 1,
    price: 240, tagline: 'Engineered for movement.',
    description: 'A low runner cut from a single engineered knit, set on a composite sole that weighs almost nothing.',
    size: 1.25, yaw: 0, hero: true,
    colors: [
      { id: 'black', label: 'BLACK', hex: '#1b1b1c', delta: 0 },
      { id: 'white', label: 'WHITE', hex: '#ece9e3', delta: 0 },
      { id: 'silver', label: 'SILVER', hex: '#8f949b', delta: 20, metal: 0.55 },
    ],
    sizes: SHOE_SIZES,
    finishes: [
      { id: 'matte', label: 'MATTE', delta: 0 },
      { id: 'gloss', label: 'GLOSS', delta: 20, note: 'LIMITED FINISH' },
    ],
    hotspots: [
      hs('material', 'MATERIAL', 'Engineered mesh construction.', [0.55, 0.62, 0.5], [0, 0, 1], { image: 'macro-material' }),
      hs('sole', 'SOLE', 'Lightweight composite sole.', [0.5, 0.12, 0.5], [0, 0, 1], { image: 'macro-sole' }),
      hs('detail', 'DETAIL', 'Hand-finished stitching.', [0.28, 0.82, 0.5], [0, 0, 1], { image: 'macro-detail' }),
    ],
    related: ['f01', 'n02', 'o02'],
  },
  {
    id: 'n02', code: 'N-02', name: 'Stride', zone: 'motion', slot: 0,
    price: 280, tagline: 'Built for distance. Cut for the city.',
    description: 'A high runner with a sock-fit collar, suede heel counter and a deep-lug outsole.',
    size: 1.25, yaw: 0,
    sizes: SHOE_SIZES,
    hotspots: [
      hs('collar', 'COLLAR', 'Sock-fit neoprene collar.', [0.35, 0.9, 0.5], [0, 0, 1]),
      hs('tread', 'TREAD', 'Deep-lug composite outsole.', [0.55, 0.08, 0.5], [0, 0, 1]),
      hs('heel', 'HEEL', 'Suede heel counter.', [0.12, 0.45, 0.5], [0, 0, 1]),
    ],
    related: ['n01', 'n03', 'f03'],
  },
  {
    id: 'n03', code: 'N-03', name: 'Slide', zone: 'motion', slot: 2,
    price: 120, tagline: 'One piece. No compromise.',
    description: 'Injection-moulded in a single pour. An architectural platform with a wide, contoured strap.',
    size: 1.05, yaw: 0,
    sizes: SHOE_SIZES,
    hotspots: [
      hs('form', 'FORM', 'Single-pour moulded foam.', [0.5, 0.5, 0.5], [0, 1, 0]),
      hs('strap', 'STRAP', 'Contoured wide strap.', [0.55, 0.8, 0.5], [0, 0, 1]),
      hs('base', 'BASE', 'Architectural platform.', [0.5, 0.1, 0.5], [0, 0, 1]),
    ],
    related: ['n01', 'o01', 'f02'],
  },

  // ── FORM ──────────────────────────────────────────────────
  {
    id: 'f01', code: 'F-01', name: 'Shell', zone: 'form', slot: 1,
    price: 620, tagline: 'Weather, rewritten.',
    description: 'An oversized three-layer shell with a high funnel collar and a concealed front.',
    size: 1.55, yaw: 0,
    colors: [
      { id: 'bone', label: 'BONE', hex: '#e6e1d7', delta: 0 },
      { id: 'black', label: 'BLACK', hex: '#171718', delta: 0 },
      { id: 'graphite', label: 'GRAPHITE', hex: '#505257', delta: 0 },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    finishes: [
      { id: 'matte', label: 'MATTE', delta: 0 },
      { id: 'waxed', label: 'WAXED', delta: 40, note: 'LIMITED FINISH' },
    ],
    hotspots: [
      hs('collar', 'COLLAR', 'High funnel collar.', [0.5, 0.92, 0.5], [0, 0, 1]),
      hs('fabric', 'FABRIC', 'Three-layer technical shell.', [0.5, 0.55, 0.5], [0, 0, 1]),
      hs('cut', 'CUT', 'Oversized structured sleeve.', [0.1, 0.4, 0.5], [0, 0, 1]),
    ],
    related: ['f02', 'n01', 'o03'],
  },
  {
    id: 'f02', code: 'F-02', name: 'Carry', zone: 'form', slot: 0,
    price: 480, tagline: 'Architecture you can hold.',
    description: 'Full-grain calfskin shaped over a rigid frame, finished with brushed silver hardware.',
    size: 1.1, yaw: 0,
    hotspots: [
      hs('leather', 'LEATHER', 'Full-grain calfskin.', [0.5, 0.4, 0.5], [0, 0, 1]),
      hs('handle', 'HANDLE', 'Rigid sculpted handle.', [0.5, 0.95, 0.5], [0, 1, 0]),
      hs('hardware', 'HARDWARE', 'Brushed silver hardware.', [0.35, 0.7, 0.5], [0, 0, 1]),
    ],
    related: ['f03', 'o01', 'd02'],
  },
  {
    id: 'f03', code: 'F-03', name: 'Lens', zone: 'form', slot: 2,
    price: 210, tagline: 'See less. Notice more.',
    description: 'Hand-polished acetate around a single smoke shield. Steel hinges, brushed by hand.',
    size: 0.95, yaw: 0,
    hotspots: [
      hs('frame', 'FRAME', 'Hand-polished acetate.', [0.2, 0.7, 0.5], [0, 0, 1]),
      hs('lens', 'LENS', 'Single smoke shield.', [0.5, 0.5, 0.5], [0, 0, 1]),
      hs('hinge', 'HINGE', 'Brushed steel hinge.', [0.9, 0.7, 0.5], [0, 0, 1]),
    ],
    related: ['o02', 'f02', 'n02'],
  },

  // ── OBJECTS ───────────────────────────────────────────────
  {
    id: 'o01', code: 'O-01', name: 'Vessel', zone: 'objects', slot: 0,
    price: 140, tagline: 'Made slowly, by hand.',
    description: 'Thrown stoneware with an asymmetric body and a speckled charcoal glaze. No two alike.',
    size: 1.2, yaw: 0, upright: true,
    hotspots: [
      hs('glaze', 'GLAZE', 'Speckled stoneware glaze.', [0.5, 0.4, 0.5], [0, 0, 1]),
      hs('form', 'FORM', 'Asymmetric thrown body.', [0.15, 0.55, 0.5], [0, 0, 1]),
      hs('neck', 'NECK', 'Narrow sculpted neck.', [0.5, 0.92, 0.5], [0, 0, 1]),
    ],
    related: ['d03', 'n03', 'a03'],
  },
  {
    id: 'o02', code: 'O-02', name: 'Chrono', zone: 'objects', slot: 1,
    price: 390, tagline: 'Time, reduced.',
    description: 'A brushed steel case around a pure black dial. No numerals. Nothing you do not need.',
    size: 1.0, yaw: 0,
    sizes: ['38MM', '41MM'],
    sizeDelta: { '41MM': 30 },
    hotspots: [
      hs('dial', 'DIAL', 'Pure black dial. No numerals.', [0.5, 0.55, 0.5], [0, 0, 1]),
      hs('case', 'CASE', 'Brushed steel case.', [0.25, 0.6, 0.5], [0, 0, 1]),
      hs('strap', 'STRAP', 'Textured rubber strap.', [0.85, 0.3, 0.5], [0, 0, 1]),
    ],
    related: ['f03', 'd02', 'o03'],
  },
  {
    id: 'o03', code: 'O-03', name: 'Sound', zone: 'objects', slot: 2,
    price: 350, tagline: 'Silence, engineered.',
    description: 'Seamless over-ear shells, pale fabric cushions and a single aluminium arc.',
    size: 1.1, yaw: 0,
    colors: [
      { id: 'bone', label: 'BONE', hex: '#e8e5de', delta: 0 },
      { id: 'black', label: 'BLACK', hex: '#1a1a1b', delta: 0 },
      { id: 'silver', label: 'SILVER', hex: '#c2c5ca', delta: 20, metal: 0.8 },
    ],
    finishes: [
      { id: 'matte', label: 'MATTE', delta: 0 },
      { id: 'gloss', label: 'GLOSS', delta: 20 },
    ],
    hotspots: [
      hs('shell', 'SHELL', 'Seamless moulded shell.', [0.2, 0.35, 0.5], [0, 0, 1]),
      hs('cushion', 'CUSHION', 'Memory foam, knit cover.', [0.75, 0.35, 0.5], [0, 0, 1]),
      hs('arc', 'ARC', 'Single aluminium arc.', [0.5, 0.95, 0.5], [0, 1, 0]),
    ],
    related: ['o02', 'f01', 'n01'],
  },

  // ── AFTER DARK (the drop) ─────────────────────────────────
  {
    id: 'd01', code: 'D-01', name: 'Eclipse', zone: 'afterdark', slot: 1,
    price: 420, tagline: 'Released after dark.',
    description: 'Obsidian gloss, liquid chrome overlays and a smoked translucent sole. One hundred pairs.',
    size: 1.25, yaw: 0,
    sizes: SHOE_SIZES,
    limited: { total: 100, start: 7 },
    hotspots: [
      hs('chrome', 'CHROME', 'Liquid chrome overlay.', [0.5, 0.55, 0.5], [0, 0, 1]),
      hs('sole', 'SOLE', 'Smoked translucent sole.', [0.5, 0.1, 0.5], [0, 0, 1]),
      hs('upper', 'UPPER', 'Obsidian gloss upper.', [0.3, 0.8, 0.5], [0, 0, 1]),
    ],
    related: ['d02', 'n01', 'a01'],
  },
  {
    id: 'd02', code: 'D-02', name: 'Molten', zone: 'afterdark', slot: 0,
    price: 300, tagline: 'Poured, never cast twice.',
    description: 'An open cuff in mirror-polished silver, shaped while the metal was still moving.',
    size: 0.85, yaw: 0,
    limited: { total: 50, start: 12 },
    hotspots: [
      hs('surface', 'SURFACE', 'Mirror-polished silver.', [0.5, 0.6, 0.5], [0, 0, 1]),
      hs('edge', 'EDGE', 'Hand-finished open edge.', [0.15, 0.5, 0.5], [0, 0, 1]),
      hs('flow', 'FLOW', 'Asymmetric molten form.', [0.8, 0.4, 0.5], [0, 0, 1]),
    ],
    related: ['d01', 'o02', 'a02'],
  },
  {
    id: 'd03', code: 'D-03', name: 'Monolith', zone: 'afterdark', slot: 2,
    price: 180, tagline: 'A scent for the hour after midnight.',
    description: 'Smoked black glass, cut into a single block. Vetiver, black pepper, cold stone.',
    size: 0.95, yaw: 0, upright: true,
    limited: { total: 200, start: 64 },
    hotspots: [
      hs('glass', 'GLASS', 'Hand-cut smoked glass.', [0.5, 0.4, 0.5], [0, 0, 1]),
      hs('cap', 'CAP', 'Brushed black metal cap.', [0.5, 0.95, 0.5], [0, 0, 1]),
      hs('notes', 'NOTES', 'Vetiver. Pepper. Cold stone.', [0.85, 0.6, 0.5], [0, 0, 1]),
    ],
    related: ['o01', 'd01', 'a03'],
  },

  // ── THE ARCHIVE (hidden) ──────────────────────────────────
  {
    id: 'a01', code: 'A-00', name: 'Prototype 0', zone: 'archive', slot: 1,
    price: 1200, tagline: 'The first attempt. Never released.',
    description: 'Resin shell over a printed lattice. The sample every NOIR runner started from.',
    size: 1.25, yaw: 0,
    sizes: ['42'],
    limited: { total: 1, start: 0, oneOfOne: true },
    hotspots: [
      hs('shell', 'SHELL', 'Translucent resin shell.', [0.5, 0.6, 0.5], [0, 0, 1]),
      hs('lattice', 'LATTICE', 'Printed internal lattice.', [0.35, 0.45, 0.5], [0, 0, 1]),
      hs('sole', 'SOLE', 'Raw clear sole.', [0.5, 0.08, 0.5], [0, 0, 1]),
    ],
    related: ['a02', 'a03', 'n01'],
  },
  {
    id: 'a02', code: 'A-01', name: 'Mirror', zone: 'archive', slot: 0,
    price: 1800, tagline: 'Reflects everything. Reveals nothing.',
    description: 'A single bag cast in polished chrome for the first NOIR show. It was never meant to be sold.',
    size: 0.95, yaw: 0,
    limited: { total: 1, start: 0, oneOfOne: true },
    hotspots: [
      hs('surface', 'SURFACE', 'Liquid chrome finish.', [0.5, 0.4, 0.5], [0, 0, 1]),
      hs('chain', 'CHAIN', 'Polished chain strap.', [0.5, 0.95, 0.5], [0, 0, 1]),
      hs('form', 'FORM', 'Pillow-soft volume.', [0.15, 0.4, 0.5], [0, 0, 1]),
    ],
    related: ['a01', 'a03', 'f02'],
  },
  {
    id: 'a03', code: 'A-02', name: 'Key', zone: 'archive', slot: 2,
    price: 900, tagline: 'For a door that no longer exists.',
    description: 'Carved from a single piece of obsidian. It opened the first NOIR store.',
    size: 1.1, yaw: 0, upright: true,
    limited: { total: 1, start: 0, oneOfOne: true },
    hotspots: [
      hs('bow', 'BOW', 'Faceted geometric bow.', [0.5, 0.85, 0.5], [0, 0, 1]),
      hs('stone', 'STONE', 'Polished obsidian.', [0.5, 0.5, 0.5], [0, 0, 1]),
      hs('bit', 'BIT', 'Hand-cut bit.', [0.55, 0.12, 0.5], [0, 0, 1]),
    ],
    related: ['a01', 'a02', 'o01'],
  },
];

// Tripo exports every model with its front along +X; `face` turns it toward the viewer.
// `yaw` is the resting three-quarter angle the object is shown at.
const Q = Math.PI / 2;
const FACE = { n01: Q, n02: Q, n03: -Q, f01: -Q, f02: Q, f03: Q, o01: 0, o02: -Q, o03: Q, d01: Q, d02: 0, d03: Q, a01: Q, a02: Q, a03: Q };
const YAW = { n01: -0.45, n02: -0.45, n03: -0.5, d01: -0.45, a01: -0.45, f01: 0.3, f02: 0.35, f03: 0.25, o02: 0.2, o03: 0.35, d03: 0.35, a02: 0.3 };
for (const p of PRODUCTS) {
  p.face = FACE[p.id] ?? 0;
  p.yaw = YAW[p.id] ?? 0.25;
}

export const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const productsIn = (zone) => PRODUCTS.filter((p) => p.zone === zone).sort((a, b) => a.slot - b.slot);

export const assetUrl = {
  model: (id) => `${import.meta.env.BASE_URL}assets/models/${id}.glb`,
  image: (id) => `${import.meta.env.BASE_URL}assets/img/${id}.webp`,
};

export function defaultConfig(p) {
  return {
    color: p.colors ? p.colors[0].id : null,
    size: p.sizes ? p.sizes[Math.min(2, p.sizes.length - 1)] : null,
    finish: p.finishes ? p.finishes[0].id : null,
  };
}

export function priceOf(p, cfg) {
  let price = p.price;
  const c = p.colors?.find((x) => x.id === cfg.color);
  const f = p.finishes?.find((x) => x.id === cfg.finish);
  if (c) price += c.delta || 0;
  if (f) price += f.delta || 0;
  if (p.sizeDelta && cfg.size) price += p.sizeDelta[cfg.size] || 0;
  return price;
}

export function describeConfig(p, cfg) {
  const out = [];
  const c = p.colors?.find((x) => x.id === cfg.color);
  const f = p.finishes?.find((x) => x.id === cfg.finish);
  if (c) out.push(c.label);
  if (cfg.size) out.push(p.sizes.length > 1 || p.zone !== 'archive' ? `SIZE ${cfg.size}` : cfg.size);
  if (f) out.push(f.label);
  return out;
}

export const money = (n) => `$${n.toLocaleString('en-US')}`;
