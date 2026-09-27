import '@fontsource-variable/manrope';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import './style.css';
import gsap from 'gsap';
import { WORLDS, worldById, PRODUCTS, byId, productsIn, defaultConfig, priceOf, describeConfig, money, assetUrl } from './data.js';
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
const VISIBLE = WORLDS.filter((w) => !w.hidden);
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
  mode = 'arrival'; // arrival | poster | inspect | checkout | void
  current = null;
  configs = new Map();
  travelling = false;
  indexTab = 'all';

  async boot() {
    await Promise.race([document.fonts.ready, wait(1500)]);
    await Promise.all([document.fonts.load('300 40px "Cormorant Garamond"'), document.fonts.load('400 20px "Manrope Variable"')]).catch(() => {});
    this.#bindUI();
    this.#renderWorldNav();
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
      onPick: (p, isHero) => (isHero ? this.inspect(p.id) : this.bringForward(p.id)),
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
    const bar = $('.arrival-progress i');
    const loading = this.world.load((p) => (bar.style.transform = `scaleX(${p})`));
    await wait(600);
    await this.#type($('[data-line="1"]'), returning ? 'WELCOME BACK TO NOIR' : 'WELCOME TO NOIR');
    await wait(800);
    await this.#type($('[data-line="2"]'), 'THE STORE IS OPEN.');
    await loading;
    this.world.setClaimed(store.isClaimed);
    this.#applyAllConfigs();
    this.#syncDrop(true);
    if (state.archiveFound) this.world.setArchiveOpen(true);
    await wait(700);
    // the canyon materialises at first light, the monument hanging over it
    $('#arrival').classList.add('is-poster');
    this.world.intro();
    this.world.ready.then(() => {
      this.world.setClaimed(store.isClaimed);
      this.#applyAllConfigs();
    });
    await wait(reduced ? 300 : 2800);
    const enter = $('.enter');
    enter.disabled = false;
    enter.classList.add('is-ready');
    this.canEnter = true;
  }

  async #type(el, text) {
    el.innerHTML = [...text].map((c) => `<span class="ch">${c}</span>`).join('');
    await new Promise((res) =>
      gsap.to($$('.ch', el), { opacity: 1, duration: 0.05, stagger: { each: 0.045, onStart: () => sound.tick(3200, 0.012) }, onComplete: res }),
    );
  }

  async enterStore() {
    if (!this.canEnter || this.mode !== 'arrival') return;
    this.canEnter = false;
    body.classList.remove('is-arriving');
    sound.whoosh(3, 0.08);
    this.#setWorld('motion');
    this.#travelling(true);
    this.#setMode('poster');
    await this.world.enter();
    this.#travelling(false);
    this.#renderPoster();
  }

  // ── 02 — THE WORLDS ──────────────────────────────────────
  #setMode(mode) {
    this.mode = mode;
    for (const m of ['poster', 'inspect', 'checkout', 'void']) body.classList.toggle(`is-${m}`, m === mode);
    this.#stages();
  }

  #setWorld(id) {
    body.dataset.world = id;
    $$('.hud-worlds button').forEach((b) => b.classList.toggle('is-active', b.dataset.world === id));
    const colors = { motion: '#0e2730', form: '#06102c', objects: '#0b1520', afterdark: '#030202', archive: '#1c130b' };
    document.querySelector('meta[name="theme-color"]').content = colors[id];
  }

  #travelling(on) {
    this.travelling = on;
    body.classList.toggle('is-travelling', on);
  }

  #renderWorldNav() {
    const list = [...VISIBLE, ...(state.archiveFound ? [worldById.archive] : [])];
    $('.hud-worlds').innerHTML = list
      .map((w) => `<button type="button" data-world="${w.id}"><em>${w.index}</em><span>${w.id === 'archive' ? 'Archive' : cap(w.name)}</span></button>`)
      .join('');
    $$('.hud-worlds button').forEach((b) => b.classList.toggle('is-active', b.dataset.world === body.dataset.world));
  }

  async goWorld(id, opts) {
    if (!this.world || !worldById[id]) return;
    if (worldById[id].hidden && !state.archiveFound) return;
    if (this.mode === 'inspect') this.#leaveInspect();
    this.closeIndex();
    if (id === this.world.worldId && this.mode === 'poster') return;
    this.#setMode('poster');
    this.#travelling(true);
    this.#setWorld(id);
    sound.whoosh(2.4, 0.06);
    await this.world.goWorld(id, opts);
    this.#travelling(false);
    this.#renderPoster();
  }

  step(dir) {
    if (!this.world || this.travelling) return;
    const i = VISIBLE.findIndex((w) => w.id === this.world.worldId);
    if (i < 0) return this.goWorld(dir > 0 ? 'motion' : 'afterdark'); // leaving the archive
    const next = VISIBLE[i + dir];
    if (next) this.goWorld(next.id);
  }

  // cycle which object is the hero of the current poster
  async cycleHero(dir) {
    if (!this.world || this.travelling || this.#locked()) return;
    const items = productsIn(this.world.worldId);
    const i = items.findIndex((p) => p.id === this.world.heroOf());
    await this.bringForward(items[(i + dir + items.length) % items.length].id);
  }

  async bringForward(id) {
    if (this.travelling || this.#locked()) return;
    this.travelling = true;
    sound.whoosh(1.1, 0.04);
    body.classList.add('is-swapping');
    this.#renderPoster(id);
    await this.world.setHero(id);
    body.classList.remove('is-swapping');
    this.travelling = false;
  }

  #locked() {
    return this.world?.worldId === 'afterdark' && !state.dropRevealed;
  }

  // The poster copy: world title, and a badge + note for the object at the centre.
  #renderPoster(heroId = this.world?.heroOf()) {
    const w = this.world ? worldById[this.world.worldId] : worldById.motion;
    $('.poster-kicker').textContent = w.kicker;
    $('.poster-title').textContent = w.title;
    $('.poster-sub').textContent = w.sub || '';
    $('.poster-line').textContent = w.line;
    const p = byId[heroId];
    if (!p) return;
    const items = productsIn(w.id);
    $('.badge-code').textContent = p.code;
    $('.badge-name').textContent = p.name;
    $('.badge-price').textContent = money(priceOf(p, this.#cfg(p.id)));
    const status = store.isOwned(p.id)
      ? 'Owned'
      : store.inBag(p.id)
        ? 'In your bag'
        : p.limited?.oneOfOne
          ? '1 of 1'
          : p.limited
            ? `${pad2(state.inventory[p.id])} / ${p.limited.total} claimed`
            : p.colors
              ? `${p.colors.length} colourways`
              : '';
    $('.badge-status').textContent = status;
    $('.note-text').textContent = `${p.tagline} ${p.description}`;
    $('.pager-count').textContent = `${pad2(items.findIndex((x) => x.id === p.id) + 1)} / ${pad2(items.length)}`;
    this.#stages();
  }

  #stages() {
    const w = this.world?.worldId;
    const locked = w === 'afterdark' && !state.dropRevealed;
    body.classList.toggle('is-drop-locked', locked && this.mode === 'poster');
    $('#drop-stage').classList.toggle('is-on', this.mode === 'poster' && locked && !this.travelling);
  }

  #swipe(dx, dy, mode) {
    if (mode === 'poster' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.cycleHero(dx < 0 ? 1 : -1);
    else if (mode === 'poster' && Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx)) this.step(dy < 0 ? 1 : -1);
    else if (mode === 'inspect' && dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.6) this.back();
    this.cursor?.classList.remove('is-drag');
  }

  #hover(h) {
    const label = $('#hover-label');
    this.hovered = h?.product || null;
    this.cursor?.classList.toggle('is-hover', !!h?.product);
    $('.cursor-label').textContent = h?.hero ? 'Explore' : h?.product ? 'Bring' : '';
    if (!h?.product) return label.classList.remove('is-on');
    $('.hover-code', label).textContent = `${h.product.code} · ${h.product.name}`;
    $('.hover-cta', label).textContent = h.hero ? 'Explore' : 'Bring forward';
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
    if (!p || this.travelling) return;
    if (p.zone === 'afterdark' && !state.dropRevealed) return;
    if (p.zone === 'archive' && !state.archiveFound) return;
    this.closeIndex();
    this.closeBag();
    this.#closeDetail(false);
    this.current = p;
    $('#hover-label').classList.remove('is-on');
    this.world.setRecommendation(null);
    this.rec = null;
    $('.inspect-rec').classList.remove('is-on');
    $('#rec-label').classList.remove('is-on');
    const trail = this.mode === 'inspect';
    if (trail) $('#inspect').style.opacity = 0;
    this.#setWorld(p.zone);
    this.#renderInspect();
    this.#travelling(true);
    sound.whoosh(1.4, 0.05);
    this.#setMode('inspect');
    await this.world.goProduct(id);
    $('#inspect').style.opacity = '';
    this.#travelling(false);
    this.#buildHotspots();
    clearTimeout(this.recTimer);
    this.recTimer = setTimeout(() => this.#recommend(), 1800);
  }

  #renderInspect() {
    const p = this.current;
    const cfg = this.#cfg(p.id);
    $('#inspect').classList.toggle('is-claimed', store.isClaimed(p.id));
    const w = worldById[p.zone];
    $('.inspect-kicker').textContent = `${w.index} — ${w.name}`;
    $('.inspect-name').textContent = p.name;
    $('.inspect-code').textContent = p.code;
    $('.inspect-tagline').textContent = p.tagline;
    $('.inspect-desc').textContent = p.description;
    this.shownPrice = priceOf(p, cfg);
    this.#renderPrice(false);
    $('.inspect-hotspots').innerHTML = p.hotspots
      .map((h, i) => `<li><button type="button" data-hotspot="${h.id}"><span class="n">${i + 1}</span>${cap(h.title)}</button></li>`)
      .join('');
    const groups = [];
    if (p.colors) groups.push(this.#group('Colour', 'color', p.colors.map((c) => ({ id: c.id, label: cap(c.label), sw: c.hex, delta: c.delta })), cfg.color));
    if (p.sizes && p.sizes.length > 1) groups.push(this.#group('Size', 'size', p.sizes.map((s) => ({ id: s, label: s, delta: p.sizeDelta?.[s] })), cfg.size));
    if (p.finishes) groups.push(this.#group('Finish', 'finish', p.finishes.map((f) => ({ id: f.id, label: cap(f.label), delta: f.delta, note: f.note })), cfg.finish));
    $('.config-title').textContent = groups.length ? 'Configure' : p.limited?.oneOfOne ? 'One of one' : 'As designed';
    $('.config-groups').innerHTML = groups.join('');
    this.#renderLimited();
    this.#renderClaim();
  }

  #group(title, key, opts, value) {
    const cur = opts.find((o) => o.id === value);
    return `<div class="config-group" data-group="${key}">
      <p><span>${title}</span><span class="val">${cur?.note ? cap(cur.note) : ''}</span></p>
      <div class="options">${opts
        .map(
          (o) => `<button type="button" class="opt" data-key="${key}" data-val="${o.id}" aria-pressed="${o.id === value}">${
            o.sw ? `<span class="sw" style="background:${o.sw}"></span>` : ''
          }${o.label}${o.delta ? `<span class="plus">+${o.delta}</span>` : ''}</button>`,
        )
        .join('')}</div></div>`;
  }

  #renderLimited() {
    const p = this.current;
    const el = $('.config-limited');
    if (!p?.limited) return (el.innerHTML = '');
    const n = state.inventory[p.id];
    const total = p.limited.oneOfOne ? 1 : p.limited.total;
    el.innerHTML = `<span>${p.limited.oneOfOne ? '1 of 1' : 'Claimed'}</span><span class="bar"><i style="width:${(n / total) * 100}%"></i></span><span class="count tnum">${pad2(n)} / ${pad2(total)}</span>`;
  }

  #renderClaim() {
    const p = this.current;
    const btn = $('#inspect .claim');
    const out = store.soldOut(p.id) && !store.inBag(p.id);
    btn.disabled = out;
    $('.claim-label', btn).textContent = out ? 'Sold out' : 'Claim object';
    $('.claim-price', btn).textContent = money(priceOf(p, this.#cfg(p.id)));
  }

  #renderPrice(animate = true) {
    const p = this.current;
    const el = $('.inspect-price');
    const target = priceOf(p, this.#cfg(p.id));
    const delta = target - p.price;
    const draw = (v) => (el.innerHTML = `<span>${money(Math.round(v))}</span><span class="delta ${delta ? 'is-on' : ''}">${delta ? `from ${money(p.price)} · +${delta}` : '&nbsp;'}</span>`);
    if (!animate) {
      draw(target);
      this.shownPrice = target;
      return;
    }
    const o = { v: this.shownPrice };
    gsap.to(o, { v: target, duration: 0.7, ease: 'power2.out', onUpdate: () => draw(o.v) });
    this.shownPrice = target;
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
    const g = $('.config-group[data-group="finish"] .val');
    if (g) g.textContent = f?.note ? cap(f.note) : '';
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
      b.dataset.n = i + 1;
      b.setAttribute('aria-label', `${a.userData.title}: ${a.userData.text}`);
      b.innerHTML = `<span>${cap(a.userData.title)}</span>`;
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

  // 09 — the store recommends: a related object lights up, and a trail leads to it
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
    $('.inspect-rec-name', btn).textContent = `${pick.code} ${pick.name}`;
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
    this.thumb(p.id, cfg);
    $('#hotspots').innerHTML = '';
    this.hotspotEls = [];
    const flight = this.world.flyToInterface(p.id, { x: bagBtn.left + bagBtn.width / 2, y: bagBtn.top + bagBtn.height / 2 });
    await wait(1450);
    store.claim(p.id, cfg);
    sound.chime();
    this.toast('Added to your collection');
    $('#inspect').classList.add('is-claimed');
    this.#renderLimited();
    await flight;
    if (!this.rec) this.#recommend();
  }

  back() {
    if (this.mode === 'inspect') {
      if (this.detailOpen) return this.#closeDetail();
      this.#leaveInspect();
      this.current = null;
      this.#setMode('poster');
      this.#travelling(true);
      sound.whoosh(1.2, 0.04);
      this.world.exitInspect().then(() => {
        this.#travelling(false);
        this.#renderPoster();
      });
    }
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
    if (this.world.inspected) this.world.exitInspect();
  }

  // ── 10 — THE SECRET: through the eclipse ─────────────────
  async openArchive() {
    if (this.travelling) return;
    const first = !state.archiveFound;
    if (this.mode === 'inspect') this.#leaveInspect();
    this.closeIndex();
    store.findArchive();
    this.#renderWorldNav();
    this.#setMode('poster');
    this.#travelling(true);
    sound.low(0.18);
    sound.whoosh(3.4, 0.09);
    if (this.world.worldId === 'afterdark') {
      await this.world.openArchive();
      this.#setWorld('archive');
    } else {
      this.#setWorld('archive');
      await this.world.goArchive();
    }
    this.#travelling(false);
    this.#renderPoster();
    if (first) this.toast('You found the archive');
  }

  // ── 11 — THE DROP ────────────────────────────────────────
  #dropLoop() {
    const clock = $('.drop-time');
    let holding = false;
    let last = performance.now();
    clock.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      holding = true;
      clock.classList.add('is-warping');
    });
    const stop = () => {
      holding = false;
      clock.classList.remove('is-warping');
    };
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
    const sim = () => {
      const id = store.tickInventory();
      if (id && this.current?.id === id) {
        this.#renderLimited();
        $('.config-limited .count')?.classList.add('tick');
      }
      if (id && this.mode === 'poster' && this.world?.heroOf() === id) this.#renderPoster();
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
      $('.drop-time').textContent = txt;
      if (state.dropRevealed) {
        $('.hud-drop-label').textContent = 'After Dark';
        $('.hud-drop-time').textContent = 'Live';
      } else $('.hud-drop-time').textContent = txt;
    }
    if (!this.world) return;
    if (state.dropRevealed) {
      if (this.world.dropState !== 'revealed' && !this.revealing) this.world.setDrop('revealed');
      return;
    }
    this.world.setDrop('locked', remaining < 30000 ? 1 - remaining / 30000 : 0);
    if (remaining <= 0 && !this.revealing && this.world.ready) this.#reveal();
  }

  async #reveal() {
    this.revealing = true;
    await this.world.ready;
    const watching = this.mode === 'poster' && this.world.worldId === 'afterdark';
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
    this.#stages();
    if (watching) {
      this.#renderPoster();
      $('#drop-live').classList.add('is-on');
      setTimeout(() => $('#drop-live').classList.remove('is-on'), 3200);
    } else this.toast('After Dark is now live →', () => this.goWorld('afterdark'));
  }

  // ── THE INDEX ────────────────────────────────────────────
  openIndex(tab = this.indexTab) {
    if (this.mode === 'checkout' || this.mode === 'void') return;
    this.closeBag();
    this.indexTab = tab;
    this.#renderIndex();
    body.classList.add('is-index');
    $('#index').setAttribute('aria-hidden', 'false');
    $('#index').scrollTop = 0;
    sound.whoosh(0.9, 0.03);
  }

  closeIndex() {
    body.classList.remove('is-index');
    $('#index').setAttribute('aria-hidden', 'true');
  }

  #renderIndex() {
    const worlds = [...VISIBLE, ...(state.archiveFound ? [worldById.archive] : [])];
    const count = state.bag.reduce((a, b) => a + b.qty, 0) + state.owned.length;
    const tabs = [
      ['all', 'All objects', PRODUCTS.filter((p) => p.zone !== 'archive' || state.archiveFound).length],
      ...worlds.map((w) => [w.id, w.id === 'archive' ? '◈ Archive' : cap(w.name), productsIn(w.id).length]),
      ['collection', 'Your collection', count],
    ];
    $('.index-tabs').innerHTML = tabs
      .map(([id, label, n]) => `<button type="button" data-tab="${id}" class="${this.indexTab === id ? 'is-active' : ''}">${label}<span class="c">${n}</span></button>`)
      .join('');
    const grid = $('.index-grid');
    if (this.indexTab === 'collection') return this.#renderCollection(grid);
    const items = PRODUCTS.filter((p) => (this.indexTab === 'all' ? p.zone !== 'archive' || state.archiveFound : p.zone === this.indexTab));
    grid.innerHTML = items
      .map((p, i) => {
        const locked = p.zone === 'afterdark' && !state.dropRevealed;
        const claimed = store.isClaimed(p.id);
        const feature = (this.indexTab === 'all' && p.slot === 1 && ['motion', 'form'].includes(p.zone)) || (this.indexTab !== 'all' && i === 0);
        const chip = locked
          ? '<span class="tile-chip hot">Locked · Drop 001</span>'
          : claimed
            ? `<span class="tile-chip">${store.isOwned(p.id) ? 'Owned' : 'In your bag'}</span>`
            : p.limited?.oneOfOne
              ? '<span class="tile-chip">1 of 1</span>'
              : p.limited
                ? `<span class="tile-chip hot">${pad2(state.inventory[p.id])} / ${p.limited.total}</span>`
                : p.colors
                  ? `<span class="tile-chip">${p.colors.length} colourways</span>`
                  : '';
        return `<button type="button" class="tile ${feature ? 'feature' : ''} ${locked ? 'is-locked' : ''} ${claimed ? 'is-claimed' : ''}" data-world="${p.zone}" data-open="${p.id}" style="animation-delay:${i * 0.04}s">
          <span class="tile-bg"></span>
          <img src="${assetUrl.image(p.id)}" alt="${p.code} ${p.name}" loading="lazy">
          ${chip}<span class="tile-go">↗</span>
          <span class="tile-meta"><span><span class="k">${p.code} · ${worldById[p.zone].name}</span><span class="n">${p.name}</span></span><span class="p tnum">${locked ? '—' : money(priceOf(p, this.#cfg(p.id)))}</span></span>
        </button>`;
      })
      .join('');
  }

  #renderCollection(grid) {
    const items = [
      ...state.bag.map((b) => ({ ...b, status: 'In your bag' })),
      ...state.owned.map((o) => ({ ...o, qty: 1, status: `Owned · #${o.order}` })),
    ];
    if (!items.length) {
      grid.innerHTML = `<div class="index-empty"><p>Nothing claimed yet.</p><span>Everything you claim is kept here</span></div>`;
      return;
    }
    grid.innerHTML = items
      .map((it, i) => {
        const p = byId[it.id];
        return `<button type="button" class="tile" data-world="${p.zone}" data-open="${p.id}" style="animation-delay:${i * 0.05}s">
          <span class="tile-bg"></span>
          <img src="${this.thumb(it.id, it.cfg)}" alt="${p.code} ${p.name}">
          <span class="tile-chip">${it.status}</span>
          <span class="tile-meta"><span><span class="k">${p.code} · ${describeConfig(p, it.cfg).join(' · ') || 'As designed'}</span><span class="n">${p.name}${it.qty > 1 ? ` × ${it.qty}` : ''}</span></span><span class="p tnum">${money(priceOf(p, it.cfg) * it.qty)}</span></span>
        </button>`;
      })
      .join('');
  }

  // ── 13 — THE BAG ─────────────────────────────────────────
  thumb(id, cfg) {
    return this.world?.thumbnail(id, cfg) || assetUrl.image(id);
  }

  openBag() {
    if (this.mode === 'checkout' || this.mode === 'void') return;
    this.closeIndex();
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
    $('#bag').classList.toggle('is-empty', !state.bag.length);
    $('.bag-items').innerHTML = state.bag
      .map((b) => {
        const p = byId[b.id];
        return `<li class="bag-item" data-key="${b.key}">
          <div class="bag-thumb"><img alt="" src="${this.thumb(b.id, b.cfg)}" onerror="this.style.opacity=0"></div>
          <div class="bag-meta">
            <p class="bag-code">${p.code}</p>
            <p class="bag-name">${p.name}</p>
            <p class="bag-cfg">${describeConfig(p, b.cfg).map(cap).join(' · ') || 'As designed'}</p>
            <div class="qty"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><span>${b.qty}</span><button type="button" data-qty="1" aria-label="Increase quantity" ${p.limited?.oneOfOne ? 'disabled' : ''}>+</button></div>
          </div>
          <div><p class="bag-price tnum">${money(priceOf(p, b.cfg) * b.qty)}</p><button type="button" class="bag-remove" data-remove>Remove</button></div>
        </li>`;
      })
      .join('');
    $('.bag-subtotal').textContent = money(store.bagTotal());
    const seen = new Set(state.bag.map((b) => b.id));
    const pool = [...state.bag.flatMap((b) => byId[b.id].related), 'n01', 'f02', 'o02', 'f01', 'o03', 'n02'];
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
      .map(
        (r) =>
          `<button type="button" class="rec-card" data-world="${r.zone}" data-rec="${r.id}"><div class="img"><img alt="${r.code} ${r.name}" src="${assetUrl.image(r.id)}"></div><p>${r.name} — ${money(priceOf(r, this.#cfg(r.id)))}</p></button>`,
      )
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

  // ── 14 — CHECKOUT ────────────────────────────────────────
  openCheckout() {
    if (!state.bag.length) return;
    this.closeBag();
    this.closeIndex();
    if (this.mode === 'inspect') {
      this.#leaveInspect();
      this.current = null;
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
      this.world.mode = 'poster';
    }
    sound.silence(false);
    this.#setMode('poster');
    this.#renderPoster();
  }

  // ── 15 — OBJECT CLAIMED ──────────────────────────────────
  async placeOrder(details) {
    const order = store.placeOrder(details);
    this.checkout.close();
    this.#setMode('void');
    body.classList.add('is-void');
    if (this.world) {
      this.world.paused = false;
      this.world.mode = 'void';
      await this.world.showVoid(order.items[0]);
    }
    sound.silence(false);
    $('.confirm-order').textContent = `ORDER #${order.number}`;
    const steps = [...$('#confirm').children];
    steps.forEach((s) => s.classList.remove('is-on'));
    await wait(2200);
    sound.chime();
    for (const [i, s] of steps.entries()) {
      s.classList.add('is-on');
      await wait([500, 900, 1400, 800, 0][i]);
    }
  }

  async returnToStore() {
    $$('#confirm > *').forEach((s) => s.classList.remove('is-on'));
    body.classList.remove('is-void');
    if (this.world) {
      this.world.hideVoid();
      this.world.setClaimed(store.isClaimed);
      this.world.mode = 'poster';
    }
    this.#setMode('poster');
    this.#renderPoster();
    this.openIndex('collection');
  }

  // ── shared ───────────────────────────────────────────────
  toast(text, action) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('is-action', !!action);
    t.onclick = action ? () => (action(), t.classList.remove('is-on')) : null;
    t.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('is-on'), action ? 6000 : 2800);
  }

  #syncSound() {
    $('.hud-sound').setAttribute('aria-pressed', String(sound.enabled));
  }

  #uiLoop() {
    const label = $('#hover-label');
    const rec = $('#rec-label');
    this.cursor = $('#cursor');
    const cur = { x: innerWidth / 2, y: innerHeight / 2 };
    const ring = $('.cursor-ring', this.cursor);
    const lab = $('.cursor-label', this.cursor);
    const dot = $('.cursor-dot', this.cursor);
    const loop = () => {
      requestAnimationFrame(loop);
      const w = this.world;
      if (!w) return;
      const px = w.pointerPx;
      cur.x += (px.x - cur.x) * 0.2;
      cur.y += (px.y - cur.y) * 0.2;
      dot.style.transform = `translate(${px.x}px, ${px.y}px)`;
      ring.style.transform = lab.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      if (this.hovered) {
        const s = w.productLabelPoint(this.hovered.id, true);
        if (s) label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, 40%)`;
      }
      if (this.rec && this.mode === 'inspect') {
        const s = w.productLabelPoint(this.rec.id);
        rec.classList.toggle('is-on', !!s?.visible && this.rec.zone === w.worldId);
        if (s) rec.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      }
      if (this.hotspotEls?.length && this.mode === 'inspect' && !this.travelling) {
        for (const h of this.hotspotEls) {
          const s = w.anchorScreen(h.anchor);
          h.el.classList.toggle('is-on', s.visible && s.facing);
          h.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
        }
      } else if (this.hotspotEls?.length) for (const h of this.hotspotEls) h.el.classList.remove('is-on');
    };
    loop();
    addEventListener('pointerup', () => this.cursor.classList.remove('is-drag'));
  }

  #bindUI() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-action]');
      if (!t) return;
      const a = t.dataset.action;
      if (t.classList.contains('enter')) return this.enterStore();
      if (t.dataset.world && t.closest('.hud-worlds')) return t.dataset.world === 'archive' ? this.openArchive() : this.goWorld(t.dataset.world);
      if (t.dataset.tab) {
        this.indexTab = t.dataset.tab;
        return this.#renderIndex();
      }
      if (t.dataset.open) return this.#openFromIndex(t.dataset.open);
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
          return this.mode === 'inspect' ? this.back() : this.goWorld('motion');
        case 'explore':
          return this.world && this.inspect(this.world.heroOf());
        case 'prev-object':
          return this.cycleHero(-1);
        case 'next-object':
          return this.cycleHero(1);
        case 'index':
          return body.classList.contains('is-index') ? this.closeIndex() : this.openIndex('all');
        case 'close-index':
          return this.closeIndex();
        case 'bag':
          return this.openBag();
        case 'close-bag':
          return this.closeBag();
        case 'checkout':
          return this.openCheckout();
        case 'drop':
          return this.goWorld('afterdark');
        case 'sound':
          sound.set(!sound.enabled);
          store.setSound(sound.enabled);
          return this.#syncSound();
        case 'back':
          return this.back();
        case 'close-detail':
          return this.#closeDetail();
        case 'return-store':
          return this.returnToStore();
      }
    });

    let acc = 0;
    let accTimer;
    addEventListener(
      'wheel',
      (e) => {
        if (body.classList.contains('is-bag') || body.classList.contains('is-index') || this.mode === 'checkout') return;
        if (this.mode === 'arrival') {
          if (e.deltaY > 10) this.enterStore();
          return;
        }
        if (this.mode !== 'poster' || this.travelling) return;
        acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        clearTimeout(accTimer);
        accTimer = setTimeout(() => (acc = 0), 180);
        if (Math.abs(acc) > 70) {
          this.step(Math.sign(acc));
          acc = 0;
        }
      },
      { passive: true },
    );

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
        if (body.classList.contains('is-index')) return this.closeIndex();
        if (this.mode === 'checkout') return this.closeCheckout();
        return this.back();
      }
      if (this.mode === 'poster' && !this.travelling && !body.classList.contains('is-index')) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') this.step(1);
        if (e.key === 'ArrowUp' || e.key === 'PageUp') this.step(-1);
        if (e.key === 'ArrowRight') this.cycleHero(1);
        if (e.key === 'ArrowLeft') this.cycleHero(-1);
        if (e.key === 'Enter') this.inspect(this.world.heroOf());
      }
    });

    store.on((type, detail) => {
      if (type === 'bag') {
        this.#syncBag(!!detail?.added);
        this.world?.setClaimed(store.isClaimed);
        if (this.mode === 'poster') this.#renderPoster();
        if (body.classList.contains('is-index')) this.#renderIndex();
        if (this.current && !store.isClaimed(this.current.id)) {
          $('#inspect').classList.remove('is-claimed');
          this.#renderClaim();
          this.#renderLimited();
        }
      }
      if (type === 'order') this.#syncBag();
    });
    if (state.sound) addEventListener('pointerdown', () => (sound.set(true), this.#syncSound()), { once: true });
  }

  #openFromIndex(id) {
    const p = byId[id];
    if (p.zone === 'afterdark' && !state.dropRevealed) {
      this.closeIndex();
      return this.goWorld('afterdark');
    }
    this.inspect(id);
  }
}

function cap(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

const app = new App();
app.boot();
window.NOIR = app;
