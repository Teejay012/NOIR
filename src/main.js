import '@fontsource-variable/inter-tight';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';
import gsap from 'gsap';
import { ZONES, PRODUCTS, byId, defaultConfig, priceOf, describeConfig, money, assetUrl } from './data.js';
import * as store from './state.js';
import { sound } from './sound.js';
import { Checkout } from './ui/checkout.js';
import { startLite } from './ui/lite.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const body = document.body;
const pad2 = (n) => String(n).padStart(2, '0');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = store.state;
if (new URLSearchParams(location.search).has('debug')) gsap.ticker.lagSmoothing(0);

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class App {
  mode = 'arrival'; // arrival | showroom | inspect | archive | checkout | void
  current = null; // product being inspected
  configs = new Map(); // remembered configuration per product
  travelling = false;

  async boot() {
    await Promise.race([document.fonts.ready, wait(1500)]);
    await Promise.all([document.fonts.load('300 40px "Inter Tight Variable"'), document.fonts.load('400 20px "IBM Plex Mono"')]).catch(() => {});
    this.#bindUI();
    this.#renderRail();
    this.#syncBag();
    this.#syncSound();
    this.checkout = new Checkout({
      onExit: () => this.closeCheckout(),
      onPlace: (details) => this.placeOrder(details),
      thumb: (id, cfg) => this.thumb(id, cfg),
    });

    if (!hasWebGL()) {
      this.lite = true;
      startLite(this);
      return;
    }
    const { World } = await import('./gl/world.js');
    const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
    this.world = new World($('#gl'), { quality: coarse ? 'low' : 'high' });
    this.world.on({
      onHover: (h) => this.#hover(h),
      onPick: (p) => this.inspect(p.id),
      onSecret: () => this.openArchive(),
      onSwipe: (dx, dy, mode) => this.#swipe(dx, dy, mode),
      onDrag: () => this.cursor?.classList.add('is-drag'),
    });
    this.world.start();
    this.#arrival();
    this.#uiLoop();
    this.#dropLoop();
  }

  // ── 01 — ARRIVAL ─────────────────────────────────────────
  async #arrival() {
    const returning = state.visits > 1 && (state.owned.length || state.bag.length);
    const l1 = returning ? 'WELCOME BACK TO NOIR' : 'WELCOME TO NOIR';
    const l2 = 'THE STORE IS OPEN.';
    const progress = $('.arrival-progress');
    let loaded = 0;
    const loading = this.world.load((p) => {
      loaded = p;
      progress.textContent = String(Math.round(p * 100)).padStart(3, '0');
    });
    await wait(700);
    await this.#type($('[data-line="1"]'), l1);
    await wait(900);
    await this.#type($('[data-line="2"]'), l2);
    await loading; // first zone
    this.world.setClaimed(store.isClaimed);
    this.#applyAllConfigs();
    this.#syncDrop(true);
    if (state.archiveFound) this.world.setArchiveOpen(true);
    this.world.intro();
    this.world.ready.then(() => {
      this.world.setClaimed(store.isClaimed);
      this.#applyAllConfigs();
      this.#syncCollection();
      progress.style.opacity = 0;
    });
    await wait(reduced ? 300 : 2600);
    const enter = $('.enter');
    enter.disabled = false;
    enter.classList.add('is-ready');
    this.canEnter = true;
    void loaded;
  }

  async #type(el, text) {
    el.innerHTML = [...text].map((c) => `<span class="ch">${c === ' ' ? ' ' : c}</span>`).join('');
    const chars = $$('.ch', el);
    // letters resolve out of noise
    await new Promise((res) =>
      gsap.to(chars, {
        opacity: 1,
        duration: 0.05,
        stagger: { each: 0.045, onStart: () => sound.tick(3200, 0.012) },
        onComplete: res,
      }),
    );
  }

  async enterStore() {
    if (!this.canEnter || this.mode !== 'arrival') return;
    this.canEnter = false;
    body.classList.remove('is-arriving');
    sound.whoosh(3, 0.08);
    await this.world.enter();
    this.#setMode('showroom');
    this.#zoneChanged();
  }

  // ── 02 — SHOWROOM ────────────────────────────────────────
  #setMode(mode) {
    this.mode = mode;
    for (const m of ['showroom', 'inspect', 'archive', 'checkout', 'void']) body.classList.toggle(`is-${m}`, m === mode);
    this.#stages();
  }

  #renderRail() {
    const rail = $('#rail');
    rail.innerHTML = ZONES.map(
      (z, i) => `<button type="button" data-zone="${i}"><span class="n">${z.index}</span>${z.id === 'collection' ? 'COLLECTION' : z.name}</button>`,
    ).join('');
    if (state.archiveFound) rail.insertAdjacentHTML('beforeend', `<button type="button" class="is-secret" data-archive>◈</button>`);
  }

  async goZone(i, opts) {
    if (!this.world || i < 0 || i >= ZONES.length) return;
    opts = { slot: this.world.portrait ? 1 : undefined, ...opts };
    if (this.mode === 'inspect') this.#leaveInspect();
    this.travelling = true;
    this.#setMode('showroom');
    this.world.zoneIndex = i;
    this.#zoneChanged();
    sound.whoosh(1.6, 0.05);
    await this.world.goZone(i, opts);
    this.travelling = false;
  }

  // Portrait: one object at a time, then on to the next zone. Landscape: zone by zone.
  step(dir) {
    const w = this.world;
    if (!w || this.travelling) return;
    const collection = ZONES[w.zoneIndex].id === 'collection';
    if (!w.portrait || collection) {
      const next = w.zoneIndex + dir;
      if (w.portrait && next >= 0 && next < ZONES.length) return this.goZone(next, { slot: dir > 0 ? 0 : 2 });
      return this.goZone(next);
    }
    const slot = (w.slot ?? 1) + dir;
    if (slot < 0) return this.goZone(w.zoneIndex - 1, { slot: 2 });
    if (slot > 2) return this.goZone(w.zoneIndex + 1, { slot: 0 });
    return this.goZone(w.zoneIndex, { slot, duration: 1.1 });
  }

  #zoneChanged() {
    const z = ZONES[this.world.zoneIndex];
    $('.hud-zone-index').textContent = z.index;
    this.#scramble($('.hud-zone-name'), z.name);
    $$('#rail button').forEach((b) => b.classList.toggle('is-active', +b.dataset.zone === this.world.zoneIndex && this.mode !== 'archive'));
    this.#stages();
  }

  // Zone-specific overlays: the drop clock, the collection, the archive line.
  #stages() {
    const z = this.world ? ZONES[this.world.zoneIndex] : null;
    const inShowroom = this.mode === 'showroom';
    $('#drop-stage').classList.toggle('is-on', inShowroom && z?.id === 'afterdark' && !state.dropRevealed);
    const inCollection = inShowroom && z?.id === 'collection';
    $('#collection-stage').classList.toggle('is-on', inCollection);
    $('#archive-stage').classList.toggle('is-on', this.mode === 'archive');
    if (inCollection) this.#collectionCopy();
  }

  #collectionCopy() {
    const n = state.bag.reduce((a, b) => a + b.qty, 0);
    const o = state.owned.length;
    const title = $('.collection-title');
    const sub = $('.collection-sub');
    const actions = $('.collection-actions');
    if (!n && !o) {
      title.textContent = 'Nothing claimed yet.';
      sub.textContent = 'EVERYTHING YOU CLAIM IS KEPT HERE.';
      actions.innerHTML = `<button class="ghost-btn" data-zone-go="0">← START WITH MOTION</button>`;
    } else {
      title.textContent = o ? `${pad2(o)} owned. ${pad2(n)} waiting.` : `${pad2(n)} object${n > 1 ? 's' : ''} claimed.`;
      const last = state.orders.at(-1);
      sub.textContent = last ? `LAST ORDER #${last.number}` : 'NOT YET YOURS. CHECK OUT TO KEEP THEM.';
      actions.innerHTML = n ? `<button class="ghost-btn" data-action="bag">OPEN YOUR BAG</button>` : '';
    }
  }

  #swipe(dx, dy, mode) {
    if (mode === 'showroom' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      this.step(dx < 0 ? 1 : -1);
    } else if (mode === 'inspect' && dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.6) {
      this.back(); // swipe down → return
    } else if (mode === 'archive' && dy > 110) {
      this.leaveArchive();
    }
    this.cursor?.classList.remove('is-drag');
  }

  #hover(h) {
    const label = $('#hover-label');
    this.hovered = h?.product || null;
    this.cursor?.classList.toggle('is-hover', !!h);
    $('.cursor-label').textContent = h?.product ? 'EXPLORE' : h?.secret ? '' : '';
    if (h?.secret) {
      this.cursor?.classList.remove('is-hover');
      return;
    }
    if (!h?.product) {
      label.classList.remove('is-on');
      return;
    }
    const p = h.product;
    $('.hover-code', label).textContent = p.code;
    const inv = p.limited ? `${pad2(state.inventory[p.id])} / ${p.limited.oneOfOne ? '01' : p.limited.total}` : money(priceOf(p, this.#cfg(p.id)));
    $('.hover-extra', label).textContent = p.limited?.oneOfOne ? '1 OF 1' : inv;
    label.classList.add('is-on');
    sound.tick(1800, 0.02);
  }

  // ── 04 — PRODUCT DISCOVERY ───────────────────────────────
  #cfg(id) {
    if (!this.configs.has(id)) this.configs.set(id, defaultConfig(byId[id]));
    return this.configs.get(id);
  }

  #applyAllConfigs() {
    for (const p of PRODUCTS) if (p.colors || p.finishes) this.world.applyConfig(p.id, this.#cfg(p.id), false);
  }

  async inspect(id) {
    const p = byId[id];
    if (!p || store.isClaimed(id) || this.travelling) return;
    if (p.zone === 'afterdark' && !state.dropRevealed) return;
    this.#closeDetail();
    this.current = p;
    $('#hover-label').classList.remove('is-on');
    this.world.setRecommendation(null);
    $('.inspect-rec').classList.remove('is-on');
    $('#rec-label').classList.remove('is-on');
    this.#renderInspect();
    this.travelling = true;
    sound.whoosh(1.4, 0.05);
    const was = this.mode;
    this.#setMode('inspect');
    body.classList.add('is-inspect-travel');
    if (was === 'inspect') {
      // walking the recommendation trail: hide the panel while moving
      $('#inspect').style.opacity = 0;
    }
    await this.world.goProduct(id);
    $('#inspect').style.opacity = '';
    this.travelling = false;
    this.#buildHotspots();
    clearTimeout(this.recTimer);
    this.recTimer = setTimeout(() => this.#recommend(), 2200);
  }

  #renderInspect() {
    const p = this.current;
    const cfg = this.#cfg(p.id);
    const root = $('#inspect');
    root.classList.toggle('is-claimed', store.isClaimed(p.id));
    const zone = ZONES.find((z) => z.id === p.zone);
    $('.inspect-zone').textContent = zone ? `${zone.index} — ${zone.name}` : '◈ — THE ARCHIVE';
    $('.inspect-code').textContent = p.code;
    $('.inspect-name').textContent = p.name;
    $('.inspect-tagline').textContent = p.tagline;
    $('.inspect-desc').textContent = p.description;
    this.shownPrice = priceOf(p, cfg);
    this.#renderPrice(false);
    $('.inspect-hotspots').innerHTML = p.hotspots
      .map((h, i) => `<li><button type="button" data-hotspot="${h.id}"><span class="mono">${pad2(i + 1)}</span>${h.title}</button></li>`)
      .join('');

    const groups = [];
    if (p.colors)
      groups.push(
        this.#group('COLOR', 'color', p.colors.map((c) => ({ id: c.id, label: c.label, sw: c.hex, delta: c.delta })), cfg.color),
      );
    if (p.sizes && p.sizes.length > 1)
      groups.push(this.#group('SIZE', 'size', p.sizes.map((s) => ({ id: s, label: s, delta: p.sizeDelta?.[s] })), cfg.size));
    if (p.finishes) groups.push(this.#group('FINISH', 'finish', p.finishes.map((f) => ({ id: f.id, label: f.label, delta: f.delta, note: f.note })), cfg.finish));
    $('.config-title').textContent = groups.length ? 'CONFIGURE' : p.limited?.oneOfOne ? 'ONE OF ONE' : 'AS DESIGNED';
    $('.config-groups').innerHTML = groups.join('');
    this.#renderLimited();
    this.#renderClaim();
  }

  #group(title, key, opts, value) {
    const cur = opts.find((o) => o.id === value);
    return `<div class="config-group" data-group="${key}">
      <p class="mono"><span>${title}</span><span class="val">${cur?.note || ''}</span></p>
      <div class="options">${opts
        .map(
          (o) => `<button type="button" class="opt" data-key="${key}" data-val="${o.id}" aria-pressed="${o.id === value}">
            ${o.sw ? `<span class="sw" style="background:${o.sw}"></span>` : ''}${o.label}${o.delta ? `<span class="plus">+${o.delta}</span>` : ''}</button>`,
        )
        .join('')}</div></div>`;
  }

  #renderLimited() {
    const p = this.current;
    const el = $('.config-limited');
    if (!p?.limited) {
      el.innerHTML = '';
      return;
    }
    const n = state.inventory[p.id];
    el.innerHTML = p.limited.oneOfOne
      ? `<span>1 OF 1 — ${n ? 'CLAIMED' : 'AVAILABLE'}</span><span class="count">${pad2(n)} / 01</span>`
      : `<span>CLAIMED</span><span class="count">${pad2(n)} / ${p.limited.total}</span>`;
  }

  #renderClaim() {
    const p = this.current;
    const btn = $('#inspect .claim');
    const out = store.soldOut(p.id) && !store.inBag(p.id);
    btn.disabled = out;
    $('.claim-label', btn).textContent = out ? 'SOLD OUT' : 'CLAIM OBJECT';
    $('.claim-price', btn).textContent = money(priceOf(p, this.#cfg(p.id)));
  }

  #renderPrice(animate = true) {
    const p = this.current;
    const el = $('.inspect-price');
    const target = priceOf(p, this.#cfg(p.id));
    const delta = target - p.price;
    const draw = (v) => {
      el.innerHTML = `<span>${money(Math.round(v))}</span><span class="delta ${delta ? 'is-on' : ''}">${delta ? `BASE ${money(p.price)} +${delta}` : ''}</span>`;
    };
    if (!animate) {
      draw(target);
      this.shownPrice = target;
      return;
    }
    const o = { v: this.shownPrice };
    gsap.to(o, {
      v: target,
      duration: 0.7,
      ease: 'power2.out',
      onUpdate: () => draw(o.v),
    });
    this.shownPrice = target;
    // the interface subtly recalculates
    gsap.fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.6 });
  }

  #setOption(key, val) {
    const p = this.current;
    if (!p || store.isClaimed(p.id)) return;
    const cfg = this.#cfg(p.id);
    if (cfg[key] === val) return;
    cfg[key] = val;
    sound.tick(key === 'color' ? 1400 : 2200, 0.04);
    if (key !== 'size') {
      this.world.applyConfig(p.id, cfg, true);
      if (key === 'color') sound.whoosh(1.1, 0.03);
    }
    $$(`.opt[data-key="${key}"]`).forEach((b) => b.setAttribute('aria-pressed', b.dataset.val === val));
    const f = p.finishes?.find((x) => x.id === cfg.finish);
    const g = $(`.config-group[data-group="finish"] .val`);
    if (g) g.textContent = f?.note || '';
    this.#renderPrice(true);
    this.#renderClaim();
  }

  #buildHotspots() {
    const layer = $('#hotspots');
    const obj = this.world.products.get(this.current.id);
    layer.innerHTML = '';
    this.hotspotEls = (obj?.hotspots || []).map((a, i) => {
      const b = document.createElement('button');
      b.className = 'hotspot';
      b.type = 'button';
      b.dataset.hotspot = a.userData.id;
      b.setAttribute('aria-label', `${a.userData.title}: ${a.userData.text}`);
      b.innerHTML = `<span>${pad2(i + 1)} — ${a.userData.title}</span>`;
      layer.appendChild(b);
      return { el: b, anchor: a };
    });
  }

  async focusHotspot(hid) {
    const p = this.current;
    const obj = this.world.products.get(p.id);
    const i = p.hotspots.findIndex((h) => h.id === hid);
    const anchor = obj?.hotspots[i];
    if (!anchor) return;
    const h = p.hotspots[i];
    $$('.inspect-hotspots button').forEach((b) => b.classList.toggle('is-active', b.dataset.hotspot === hid));
    sound.tick(900, 0.05);
    sound.whoosh(1.2, 0.03);
    const card = $('#detail-card');
    $('.detail-index', card).textContent = `${pad2(i + 1)} / ${pad2(p.hotspots.length)} — ${p.code}`;
    $('.detail-title', card).textContent = h.title;
    $('.detail-text', card).textContent = h.text;
    const media = $('.detail-media', card);
    media.classList.remove('has-img');
    if (h.image) {
      media.style.backgroundImage = `url(${assetUrl.image(h.image)})`;
      void media.offsetWidth;
      media.classList.add('has-img');
    }
    body.classList.add('is-detail');
    this.detailOpen = true;
    await this.world.focusHotspot(anchor);
  }

  #closeDetail(reset = true) {
    if (!this.detailOpen) return;
    this.detailOpen = false;
    body.classList.remove('is-detail');
    $$('.inspect-hotspots button').forEach((b) => b.classList.remove('is-active'));
    if (reset) this.world.resetInspectView();
  }

  // 09 — the store recommends through light
  #recommend() {
    const p = this.current;
    if (!p || this.mode !== 'inspect') return;
    const pick = p.related
      .map((id) => byId[id])
      .find((r) => r && !store.isClaimed(r.id) && (r.zone !== 'afterdark' || state.dropRevealed) && (r.zone !== 'archive' || state.archiveFound));
    if (!pick) return;
    this.rec = pick;
    this.world.setRecommendation(pick.id);
    const btn = $('.inspect-rec');
    $('.inspect-rec-name', btn).textContent = `${pick.code} ${pick.name.toUpperCase()}`;
    btn.classList.add('is-on');
    sound.tick(700, 0.03);
  }

  async claim() {
    const p = this.current;
    if (!p || store.isClaimed(p.id) || store.soldOut(p.id)) return;
    const cfg = { ...this.#cfg(p.id) };
    this.#closeDetail(false);
    $('#inspect .claim').disabled = true;
    sound.whoosh(1.4, 0.06);
    const bagBtn = $('.hud-bag').getBoundingClientRect();
    // thumbnail first — the object is about to leave its pedestal
    this.thumb(p.id, cfg);
    await this.world.flyToInterface(p.id, { x: bagBtn.left + bagBtn.width / 2, y: bagBtn.top + bagBtn.height / 2 });
    store.claim(p.id, cfg);
    sound.chime();
    this.toast('ADDED TO YOUR COLLECTION');
    $('#inspect').classList.add('is-claimed');
    this.#renderLimited();
    this.world.setClaimed(store.isClaimed);
    $('#hotspots').innerHTML = '';
    if (!this.rec) this.#recommend();
  }

  back() {
    if (this.mode === 'inspect') {
      if (this.detailOpen) return this.#closeDetail();
      this.#leaveInspect();
      const inArchive = this.current?.zone === 'archive';
      this.current = null;
      this.#setMode(inArchive ? 'archive' : 'showroom');
      this.#zoneChanged();
      this.travelling = true;
      sound.whoosh(1.2, 0.04);
      this.world.exitInspect().then(() => (this.travelling = false));
    } else if (this.mode === 'archive') this.leaveArchive();
  }

  #leaveInspect() {
    clearTimeout(this.recTimer);
    this.#closeDetail(false);
    this.world.setRecommendation(null);
    this.rec = null;
    $('#hotspots').innerHTML = '';
    this.hotspotEls = [];
    $('.inspect-rec').classList.remove('is-on');
    $('#rec-label').classList.remove('is-on');
  }

  // ── 10 — THE SECRET ROOM ─────────────────────────────────
  async openArchive() {
    if (this.travelling) return;
    this.travelling = true;
    const first = !state.archiveFound;
    if (this.mode === 'inspect') this.#leaveInspect();
    store.findArchive();
    this.#renderRail();
    this.#setMode('archive');
    $$('#rail button').forEach((b) => b.classList.toggle('is-active', b.dataset.archive !== undefined));
    $('.hud-zone-index').textContent = '◈';
    this.#scramble($('.hud-zone-name'), 'THE ARCHIVE');
    sound.low(0.16);
    sound.whoosh(3.2, 0.08);
    if (first) await this.world.openArchive();
    else await this.world.goArchive();
    this.travelling = false;
  }

  leaveArchive() {
    const i = ZONES.findIndex((z) => z.id === 'afterdark');
    this.goZone(i);
  }

  // ── 11 — THE DROP ────────────────────────────────────────
  #dropLoop() {
    const clock = $('.drop-time');
    let holding = false;
    let last = performance.now();
    const start = (e) => {
      e.preventDefault();
      holding = true;
      clock.classList.add('is-warping');
    };
    const stop = () => {
      holding = false;
      clock.classList.remove('is-warping');
    };
    clock.addEventListener('pointerdown', start);
    addEventListener('pointerup', stop);
    addEventListener('pointercancel', stop);
    clock.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') store.advanceDrop(60000);
    });
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (holding && !state.dropRevealed) {
        store.advanceDrop(dt * 90);
        if (Math.random() < 0.3) sound.tick(600 + Math.random() * 400, 0.015);
      }
      this.#syncDrop();
      requestAnimationFrame(tick);
    };
    tick();
    // other collectors, simulated
    const sim = () => {
      const id = store.tickInventory();
      if (id && this.current?.id === id) {
        this.#renderLimited();
        $('.config-limited .count')?.classList.add('tick');
      }
      setTimeout(sim, 9000 + Math.random() * 14000);
    };
    setTimeout(sim, 12000);
  }

  #syncDrop(force) {
    const remaining = store.dropRemaining();
    const s = Math.ceil(remaining / 1000);
    const txt = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
    const key = txt + state.dropRevealed;
    if (key !== this.lastDropTxt || force) {
      this.lastDropTxt = key;
      $('.drop-time').textContent = txt.replaceAll(':', ' : ');
      const hud = $('.hud-drop');
      if (state.dropRevealed) {
        hud.classList.add('is-live');
        $('.hud-drop-label').textContent = 'AFTER DARK';
        $('.hud-drop-time').textContent = 'LIVE';
      } else $('.hud-drop-time').textContent = txt;
    }
    if (!this.world) return;
    if (state.dropRevealed) {
      if (this.world.dropState !== 'revealed' && !this.revealing) this.world.setDrop('revealed');
      return;
    }
    const charge = remaining < 30000 ? 1 - remaining / 30000 : 0;
    this.world.setDrop('locked', charge);
    if (remaining <= 0 && !this.revealing && this.world.ready) this.#reveal();
  }

  async #reveal() {
    this.revealing = true;
    await this.world.ready;
    const zi = ZONES.findIndex((z) => z.id === 'afterdark');
    const watching = this.mode === 'showroom' && this.world.zoneIndex === zi;
    // everything goes silent
    body.classList.add('is-silent');
    $('#drop-stage').classList.remove('is-on');
    sound.silence(true);
    if (watching) sound.low(0.2);
    await this.world.revealDrop();
    store.revealDrop();
    sound.silence(false);
    sound.chime();
    body.classList.remove('is-silent');
    this.revealing = false;
    if (watching) {
      $('#drop-live').classList.add('is-on');
      setTimeout(() => $('#drop-live').classList.remove('is-on'), 3200);
    } else {
      this.toast('AFTER DARK IS NOW LIVE →', () => this.goZone(zi));
    }
    this.#stages();
  }

  // ── 13 — THE BAG ─────────────────────────────────────────
  thumb(id, cfg) {
    return this.world?.thumbnail(id, cfg) || assetUrl.image(id);
  }

  openBag() {
    if (this.mode === 'checkout' || this.mode === 'void') return;
    this.#renderBag();
    body.classList.add('is-bag');
    $('#bag').setAttribute('aria-hidden', 'false');
    sound.whoosh(0.9, 0.03);
  }

  closeBag() {
    body.classList.remove('is-bag');
    $('#bag').setAttribute('aria-hidden', 'true');
  }

  #renderBag() {
    const list = $('.bag-items');
    $('#bag').classList.toggle('is-empty', !state.bag.length);
    list.innerHTML = state.bag
      .map((b) => {
        const p = byId[b.id];
        return `<li class="bag-item" data-key="${b.key}">
          <div class="bag-thumb"><img alt="" src="${this.thumb(b.id, b.cfg)}" onerror="this.style.opacity=0"></div>
          <div class="bag-meta">
            <p class="bag-code">${p.code}</p>
            <p class="bag-name">${p.name}</p>
            <p class="bag-cfg mono">${describeConfig(p, b.cfg).join('<br>') || 'AS DESIGNED'}</p>
            <div class="qty"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><span class="mono">${b.qty}</span><button type="button" data-qty="1" aria-label="Increase quantity" ${p.limited?.oneOfOne ? 'disabled' : ''}>+</button></div>
          </div>
          <div><p class="bag-price">${money(priceOf(p, b.cfg) * b.qty)}</p><button type="button" class="bag-remove" data-remove>REMOVE</button></div>
        </li>`;
      })
      .join('');
    $('.bag-subtotal').textContent = money(store.bagTotal());
    // YOU MAY ALSO LIKE — three objects, straight back into the showroom
    const seen = new Set(state.bag.map((b) => b.id));
    const pool = [...state.bag.flatMap((b) => byId[b.id].related), ...['n01', 'f02', 'o02', 'f01', 'o03', 'n02']];
    const recs = [];
    for (const id of pool) {
      const r = byId[id];
      if (!r || seen.has(id) || store.isClaimed(id)) continue;
      if (r.zone === 'archive' && !state.archiveFound) continue;
      if (r.zone === 'afterdark' && !state.dropRevealed) continue;
      seen.add(id);
      recs.push(r);
      if (recs.length === 3) break;
    }
    $('.bag-recs-list').innerHTML = recs
      .map((r) => `<button type="button" class="rec-card" data-rec="${r.id}"><div class="img"><img alt="${r.code} ${r.name}" src="${this.thumb(r.id, this.#cfg(r.id))}"></div><p>${r.code} — ${money(priceOf(r, this.#cfg(r.id)))}</p></button>`)
      .join('');
  }

  #syncBag(bump) {
    const el = $('.bag-count');
    el.textContent = pad2(store.bagCount());
    if (bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  #syncCollection() {
    if (!this.world) return;
    const items = [
      ...state.owned.map((o) => ({ id: o.id, cfg: o.cfg, owned: true, code: byId[o.id].code })),
      ...state.bag.map((b) => ({ id: b.id, cfg: b.cfg, owned: false, code: byId[b.id].code })),
    ];
    this.world.setCollection(items);
  }

  // ── 14 — CHECKOUT ────────────────────────────────────────
  openCheckout() {
    if (!state.bag.length) return;
    this.closeBag();
    this.prevMode = this.mode === 'inspect' ? 'showroom' : this.mode;
    if (this.mode === 'inspect') {
      this.#leaveInspect();
      this.current = null;
      this.world.exitInspect();
    }
    this.#setMode('checkout');
    if (this.world) this.world.mode = 'checkout';
    this.checkout.open();
    sound.silence(true);
    setTimeout(() => this.mode === 'checkout' && this.world && (this.world.paused = true), 1700);
  }

  closeCheckout() {
    this.checkout.close();
    if (this.world) {
      this.world.paused = false;
      this.world.mode = this.prevMode === 'archive' ? 'archive' : 'showroom';
    }
    sound.silence(false);
    this.#setMode(this.prevMode === 'archive' ? 'archive' : 'showroom');
    this.#zoneChanged();
  }

  // ── 15 — OBJECT CLAIMED ──────────────────────────────────
  async placeOrder(details) {
    const order = store.placeOrder(details);
    const first = order.items[0];
    this.checkout.close();
    this.#setMode('void');
    body.classList.add('is-void');
    if (this.world) {
      this.world.paused = false;
      this.world.mode = 'void';
      await this.world.showVoid(first);
    }
    sound.silence(false);
    const el = $('#confirm');
    $('.confirm-order', el).textContent = `ORDER #${order.number}`;
    const steps = [...el.children];
    steps.forEach((s) => s.classList.remove('is-on'));
    await wait(2400);
    sound.chime();
    steps[0].classList.add('is-on');
    await wait(1100);
    steps[1].classList.add('is-on');
    await wait(1600);
    steps[2].classList.add('is-on');
    await wait(900);
    steps[3].classList.add('is-on');
  }

  async returnToStore() {
    $$('#confirm > *').forEach((s) => s.classList.remove('is-on'));
    body.classList.remove('is-void');
    if (this.world) {
      this.world.hideVoid();
      this.world.setClaimed(store.isClaimed);
    }
    this.#syncCollection();
    const ci = ZONES.findIndex((z) => z.id === 'collection');
    if (this.world) {
      this.world.zoneIndex = ci;
      this.world.mode = 'showroom';
    }
    await this.goZone(ci, { duration: 0.01 });
  }

  // ── shared bits ──────────────────────────────────────────
  toast(text, action) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('is-action', !!action);
    t.onclick = action ? () => (action(), t.classList.remove('is-on')) : null;
    t.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('is-on'), action ? 6000 : 2800);
  }

  #scramble(el, text) {
    const glyphs = 'NOIR◈—01/';
    let frame = 0;
    const total = 14;
    cancelAnimationFrame(this.scrambleRaf);
    const run = () => {
      frame++;
      el.textContent = [...text].map((c, i) => (c === ' ' || i < (frame / total) * text.length ? c : glyphs[(Math.random() * glyphs.length) | 0])).join('');
      if (frame < total) this.scrambleRaf = requestAnimationFrame(run);
      else el.textContent = text;
    };
    run();
  }

  #syncSound() {
    $('.hud-sound').setAttribute('aria-pressed', String(sound.enabled));
  }

  // DOM elements pinned to 3D positions, and the cursor.
  #uiLoop() {
    const label = $('#hover-label');
    const rec = $('#rec-label');
    this.cursor = $('#cursor');
    const cur = { x: innerWidth / 2, y: innerHeight / 2 };
    const ring = $('.cursor-ring', this.cursor);
    const loop = () => {
      requestAnimationFrame(loop);
      const w = this.world;
      if (!w) return;
      const px = w.pointerPx;
      cur.x += (px.x - cur.x) * 0.2;
      cur.y += (px.y - cur.y) * 0.2;
      $('.cursor-dot', this.cursor).style.transform = `translate(${px.x}px, ${px.y}px)`;
      ring.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      $('.cursor-label', this.cursor).style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      const focus = this.#focused();
      if (focus !== this.focusedId) {
        this.focusedId = focus;
        if (focus) this.#hover({ product: byId[focus] });
        else if (!matchMedia('(hover: hover)').matches) this.#hover(null);
        $('.hover-cta', label).textContent = focus ? 'TAP TO EXPLORE' : 'EXPLORE OBJECT';
      }
      if (this.hovered) {
        const s = w.productLabelPoint(this.hovered.id);
        if (s) label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      }
      if (this.rec && this.mode === 'inspect') {
        const s = w.productLabelPoint(this.rec.id);
        rec.classList.toggle('is-on', !!s?.visible);
        if (s) rec.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      }
      if (this.hotspotEls?.length && this.mode === 'inspect' && !this.travelling) {
        for (const h of this.hotspotEls) {
          const s = w.anchorScreen(h.anchor);
          h.el.classList.toggle('is-on', s.visible && s.facing);
          h.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
        }
      } else if (this.hotspotEls?.length) {
        for (const h of this.hotspotEls) h.el.classList.remove('is-on');
      }
    };
    loop();
    addEventListener('pointerup', () => this.cursor.classList.remove('is-drag'));
  }

  // on portrait screens the object in front of you is always "hovered"
  #focused() {
    const w = this.world;
    if (!w?.portrait || this.travelling || (this.mode !== 'showroom' && this.mode !== 'archive')) return null;
    const zone = this.mode === 'archive' ? 'archive' : ZONES[w.zoneIndex].id;
    const p = PRODUCTS.find((x) => x.zone === zone && x.slot === (w.slot ?? 1));
    if (!p || store.isClaimed(p.id) || (zone === 'afterdark' && !state.dropRevealed)) return null;
    return p.id;
  }

  #bindUI() {
    // one delegated click handler for every [data-action]
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-action]');
      if (!t) return;
      const a = t.dataset.action;
      if (t.classList.contains('enter')) return this.enterStore();
      if (t.dataset.zone !== undefined) return this.goZone(+t.dataset.zone);
      if (t.dataset.zoneGo !== undefined) return this.goZone(+t.dataset.zoneGo);
      if (t.dataset.archive !== undefined) return this.openArchive();
      if (t.dataset.hotspot) return this.focusHotspot(t.dataset.hotspot);
      if (t.classList.contains('opt')) return this.#setOption(t.dataset.key, t.dataset.val);
      if (t.classList.contains('claim') && t.closest('#inspect')) return this.claim();
      if (t.classList.contains('inspect-rec')) return this.rec && this.inspect(this.rec.id);
      if (t.dataset.rec) {
        this.closeBag();
        return this.inspect(t.dataset.rec);
      }
      if (t.dataset.qty || t.dataset.remove !== undefined) {
        const key = t.closest('.bag-item').dataset.key;
        const item = state.bag.find((b) => b.key === key);
        if (!item) return;
        store.setQty(key, t.dataset.remove !== undefined ? 0 : item.qty + +t.dataset.qty);
        sound.tick(1600, 0.03);
        return this.#renderBag();
      }
      switch (a) {
        case 'home':
          return this.mode === 'inspect' ? this.back() : this.mode === 'showroom' || this.mode === 'archive' ? this.goZone(0) : null;
        case 'bag':
          return this.openBag();
        case 'close-bag':
          return this.closeBag();
        case 'checkout':
          return this.openCheckout();
        case 'collection':
          this.closeBag();
          return this.goZone(ZONES.findIndex((z) => z.id === 'collection'));
        case 'drop':
          return this.goZone(ZONES.findIndex((z) => z.id === 'afterdark'));
        case 'sound':
          sound.set(!sound.enabled);
          store.setSound(sound.enabled);
          return this.#syncSound();
        case 'back':
          return this.back();
        case 'close-detail':
          return this.#closeDetail();
        case 'leave-archive':
          return this.leaveArchive();
        case 'return-store':
          return this.returnToStore();
      }
    });

    // wheel → walk between zones (arrival: wheel enters the store)
    let acc = 0;
    let accTimer;
    addEventListener(
      'wheel',
      (e) => {
        if (body.classList.contains('is-bag') || this.mode === 'checkout') return;
        if (this.mode === 'arrival') {
          if (e.deltaY > 10) this.enterStore();
          return;
        }
        if (this.mode !== 'showroom' || this.travelling) return;
        acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        clearTimeout(accTimer);
        accTimer = setTimeout(() => (acc = 0), 180);
        if (Math.abs(acc) > 60) {
          this.step(Math.sign(acc));
          acc = 0;
        }
      },
      { passive: true },
    );

    // touch: swipe up on arrival enters
    let ty = null;
    addEventListener('touchstart', (e) => (ty = e.touches[0].clientY), { passive: true });
    addEventListener(
      'touchend',
      (e) => {
        if (this.mode === 'arrival' && ty !== null && ty - e.changedTouches[0].clientY > 40) this.enterStore();
        ty = null;
      },
      { passive: true },
    );

    addEventListener('keydown', (e) => {
      if (e.target.matches('input')) return;
      if (this.mode === 'arrival' && ['Enter', ' ', 'ArrowDown'].includes(e.key)) return this.enterStore();
      if (e.key === 'Escape') {
        if (body.classList.contains('is-bag')) return this.closeBag();
        if (this.mode === 'checkout') return this.closeCheckout();
        return this.back();
      }
      if (this.mode === 'showroom' && !this.travelling) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.step(1);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.step(-1);
      }
    });

    // bag / order / drop events from the store
    store.on((type, detail) => {
      if (type === 'bag') {
        this.#syncBag(!!detail?.added);
        this.world?.setClaimed(store.isClaimed);
        this.#syncCollection();
        this.#stages();
        if (this.current && !store.isClaimed(this.current.id)) {
          $('#inspect').classList.remove('is-claimed');
          this.#renderClaim();
          this.#renderLimited();
        }
      }
      if (type === 'order') {
        this.#syncBag();
        this.#syncCollection();
      }
    });
    if (state.sound) {
      // browsers need a gesture before audio — resume on the first one
      addEventListener('pointerdown', () => (sound.set(true), this.#syncSound()), { once: true });
    }
  }
}

const app = new App();
app.boot();
window.NOIR = app; // handy for poking around in the console
