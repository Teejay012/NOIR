// Persistent store state. Everything the store "remembers" lives here:
// the bag, owned objects, simulated inventory, the drop clock and the archive.
import { PRODUCTS, byId, priceOf } from './data.js';

const KEY = 'noir:v1';
const DROP_LEAD_MS = (7 * 60 + 42) * 1000; // 00:07:42 — the first drop is always this far away

function fresh() {
  const inventory = {};
  for (const p of PRODUCTS) if (p.limited) inventory[p.id] = p.limited.start;
  return {
    visits: 0,
    bag: [], // { key, id, cfg, qty }
    owned: [], // { id, cfg, order, at }
    orders: [], // { number, total, items, at }
    inventory,
    dropAt: Date.now() + DROP_LEAD_MS,
    dropRevealed: false,
    archiveFound: false,
    sound: false,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    return fresh();
  }
}

const listeners = new Set();
export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode — the store simply forgets */
  }
}

export function emit(type, detail) {
  save();
  for (const fn of listeners) fn(type, detail);
}

export function on(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const cfgKey = (id, cfg) => `${id}|${cfg.color || ''}|${cfg.size || ''}|${cfg.finish || ''}`;

// ── Bag ─────────────────────────────────────────────────────
export function claim(id, cfg) {
  const p = byId[id];
  const key = cfgKey(id, cfg);
  const existing = state.bag.find((b) => b.key === key);
  if (existing && !p.limited?.oneOfOne) existing.qty += 1;
  else if (!existing) state.bag.push({ key, id, cfg: { ...cfg }, qty: 1 });
  if (p.limited) state.inventory[id] = Math.min(p.limited.total, (state.inventory[id] || 0) + 1);
  emit('bag', { added: id });
}

export function setQty(key, qty) {
  const item = state.bag.find((b) => b.key === key);
  if (!item) return;
  const p = byId[item.id];
  if (p.limited?.oneOfOne) qty = Math.min(qty, 1);
  if (qty <= 0) {
    state.bag = state.bag.filter((b) => b.key !== key);
    if (p.limited) state.inventory[item.id] = Math.max(p.limited.start, state.inventory[item.id] - item.qty);
    emit('bag', { removed: item.id });
    return;
  }
  if (p.limited) {
    const room = p.limited.total - state.inventory[item.id];
    const diff = Math.min(qty - item.qty, room);
    state.inventory[item.id] += diff;
    qty = item.qty + diff;
  }
  item.qty = qty;
  emit('bag', {});
}

export const bagCount = () => state.bag.reduce((n, b) => n + b.qty, 0);
export const bagTotal = () => state.bag.reduce((n, b) => n + priceOf(byId[b.id], b.cfg) * b.qty, 0);
export const inBag = (id) => state.bag.some((b) => b.id === id);
export const isOwned = (id) => state.owned.some((o) => o.id === id);
// A pedestal is empty when its object has been claimed by you.
export const isClaimed = (id) => inBag(id) || isOwned(id);

export function soldOut(id) {
  const p = byId[id];
  if (!p.limited) return false;
  return state.inventory[id] >= p.limited.total;
}

// ── Orders ──────────────────────────────────────────────────
export function placeOrder(details) {
  const number = `NOIR-${String(Math.floor(800 + Math.random() * 9100)).padStart(4, '0')}`;
  const shipping = details.delivery === 'express' ? 25 : 0;
  const order = {
    number,
    total: bagTotal() + shipping,
    shipping,
    items: state.bag.map((b) => ({ id: b.id, cfg: b.cfg, qty: b.qty })),
    at: Date.now(),
  };
  state.orders.push(order);
  for (const b of state.bag) state.owned.push({ id: b.id, cfg: b.cfg, order: number, at: order.at });
  state.bag = [];
  emit('order', order);
  return order;
}

// ── Drop & archive ──────────────────────────────────────────
export const dropRemaining = () => Math.max(0, state.dropAt - Date.now());

export function advanceDrop(ms) {
  state.dropAt -= ms;
}

export function revealDrop() {
  state.dropRevealed = true;
  emit('drop', {});
}

export function findArchive() {
  if (state.archiveFound) return;
  state.archiveFound = true;
  emit('archive', {});
}

// Other collectors, simulated: while the drop is live the limited counters creep upward.
export function tickInventory() {
  if (!state.dropRevealed) return null;
  const pool = PRODUCTS.filter((p) => p.zone === 'afterdark' && !soldOut(p.id));
  if (!pool.length) return null;
  const p = pool[Math.floor(Math.random() * pool.length)];
  // keep at least a handful available so the visitor is never locked out
  if (state.inventory[p.id] >= p.limited.total - 3) return null;
  state.inventory[p.id] += 1;
  emit('inventory', { id: p.id });
  return p.id;
}

export function setSound(on) {
  state.sound = on;
  emit('sound', {});
}

export function resetStore() {
  localStorage.removeItem(KEY);
  location.reload();
}

state.visits += 1;
save();
