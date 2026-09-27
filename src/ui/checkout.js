// 14 — CHECKOUT. After everything before it, this is deliberately calm: paper, type, four steps.
// Demo store: nothing typed here leaves the browser.
import { byId, priceOf, describeConfig, money } from '../data.js';
import { state, bagTotal } from '../state.js';

const STEPS = ['details', 'delivery', 'payment', 'confirm'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Checkout {
  constructor({ onExit, onPlace, thumb }) {
    this.el = document.querySelector('#checkout');
    this.onExit = onExit;
    this.onPlace = onPlace;
    this.thumb = thumb;
    this.data = { name: '', email: '', address: '', city: '', postcode: '', country: '', delivery: 'standard', payment: 'card', card: '', expiry: '', cvc: '' };
    this.step = 0;
    this.done = new Set();
    this.el.addEventListener('click', (e) => this.#click(e));
    this.el.addEventListener('input', (e) => this.#input(e));
    this.el.addEventListener('submit', (e) => e.preventDefault());
  }

  open() {
    this.step = 0;
    this.done.clear();
    this.#render();
    this.el.scrollTop = 0;
    setTimeout(() => this.el.querySelector('input')?.focus({ preventScroll: true }), 1500);
  }

  close() {}

  get shipping() {
    return this.data.delivery === 'express' ? 25 : 0;
  }

  #render() {
    const d = this.data;
    const sub = bagTotal();
    const total = sub + this.shipping;
    const summaries = {
      details: d.name ? `${esc(d.name)} — ${esc(d.city)}` : '',
      delivery: d.delivery === 'express' ? 'Express — 1–2 days' : 'Standard — 3–5 days',
      payment: d.payment === 'card' ? (d.card ? `Card •••• ${esc(d.card.replace(/\s/g, '').slice(-4))}` : 'Card') : 'Wallet',
      confirm: '',
    };
    const step = (i, key, title, inner) => `
      <div class="co-step ${this.step === i ? 'is-open' : ''} ${this.done.has(key) ? 'is-done' : ''}" data-step="${i}">
        <button type="button" class="co-step-head" data-goto="${i}" ${this.done.has(key) || i <= this.step ? '' : 'disabled'}>
          <span class="n">0${i + 1}</span>${title}<span class="sum">${this.step !== i && this.done.has(key) ? summaries[key] : ''}</span>
        </button>
        <div class="co-step-body"><div class="co-step-inner"><div class="pad">${inner}</div></div></div>
      </div>`;
    const field = (name, label, opts = {}) => `
      <div class="field ${opts.half ? 'half' : ''}">
        <label for="co-${name}">${label}</label>
        <input id="co-${name}" name="${name}" value="${esc(d[name])}" autocomplete="${opts.ac || 'off'}" ${opts.type ? `type="${opts.type}"` : ''} ${opts.mode ? `inputmode="${opts.mode}"` : ''} placeholder="${opts.ph || ''}" />
      </div>`;
    const choice = (group, id, title, sub, price) => `
      <button type="button" class="choice" data-choice="${group}" data-val="${id}" aria-pressed="${d[group] === id}">
        <span><strong>${title}</strong><small>${sub}</small></span><span class="p">${price}</span>
      </button>`;

    this.el.innerHTML = `
      <div class="co">
        <div class="co-top">
          <span class="brand">NOIR</span>
          <button type="button" class="pill ghost" data-exit>← Return to the store</button>
        </div>
        <form class="co-main" novalidate>
          <h2>Check<em>out</em></h2>
          ${step(0, 'details', 'Details', `
            <div class="fields">
              ${field('name', 'Name', { ac: 'name' })}
              ${field('email', 'Email', { ac: 'email', type: 'email', mode: 'email' })}
              ${field('address', 'Address', { ac: 'street-address' })}
              ${field('city', 'City', { half: true, ac: 'address-level2' })}
              ${field('postcode', 'Postcode', { half: true, ac: 'postal-code' })}
              ${field('country', 'Country', { ac: 'country-name' })}
            </div>
            <button type="button" class="co-next" data-next="0">Continue ↓</button>`)}
          ${step(1, 'delivery', 'Delivery', `
            ${choice('delivery', 'standard', 'Standard', '3–5 working days. Signed for.', 'FREE')}
            ${choice('delivery', 'express', 'Express', '1–2 working days. Before noon.', '$25')}
            <button type="button" class="co-next" data-next="1">Continue ↓</button>`)}
          ${step(2, 'payment', 'Payment', `
            ${choice('payment', 'card', 'Card', 'Visa, Mastercard, Amex', '')}
            ${choice('payment', 'wallet', 'Wallet', 'Apple Pay, Google Pay', '')}
            ${d.payment === 'card' ? `<div class="fields" style="margin-top:14px">
              ${field('card', 'Card number', { mode: 'numeric', ph: '4242 4242 4242 4242' })}
              ${field('expiry', 'Expiry', { half: true, mode: 'numeric', ph: 'MM / YY' })}
              ${field('cvc', 'CVC', { half: true, mode: 'numeric', ph: '123' })}
            </div>` : ''}
            <p class="co-note">Demo store — no payment is taken and nothing you type leaves this page.</p>
            <button type="button" class="co-next" data-next="2">Continue ↓</button>`)}
          ${step(3, 'confirm', 'Confirm', `
            <div class="co-confirm-total"><span>Total</span><span class="big">${money(total)}</span></div>
            <button type="button" class="claim pill solid" data-place><span class="claim-label">Claim order</span><span class="claim-price">${money(total)}</span></button>`)}
        </form>
        <aside class="co-summary">
          <p>Your bag — ${String(state.bag.reduce((a, b) => a + b.qty, 0)).padStart(2, '0')}</p>
          ${state.bag
            .map((b) => {
              const p = byId[b.id];
              return `<div class="co-line"><div class="th" style="background-image:url('${this.thumb(b.id, b.cfg)}')"></div>
                <div><p>${p.code} ${b.qty > 1 ? `× ${b.qty}` : ''}</p><small>${describeConfig(p, b.cfg).join(' · ') || 'AS DESIGNED'}</small></div>
                <span class="p">${money(priceOf(p, b.cfg) * b.qty)}</span></div>`;
            })
            .join('')}
          <div class="co-totals">
            <div><span>SUBTOTAL</span><span>${money(sub)}</span></div>
            <div><span>DELIVERY</span><span>${this.shipping ? money(this.shipping) : 'FREE'}</span></div>
            <div><span>TOTAL</span><span>${money(total)}</span></div>
          </div>
        </aside>
      </div>`;
  }

  #input(e) {
    const t = e.target;
    if (!t.name) return;
    let v = t.value;
    if (t.name === 'card') v = v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    if (t.name === 'expiry') v = v.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1 / $2');
    if (t.name === 'cvc') v = v.replace(/\D/g, '').slice(0, 4);
    if (v !== t.value) t.value = v;
    this.data[t.name] = v;
    t.classList.remove('is-invalid');
  }

  #valid(i) {
    const d = this.data;
    const bad = [];
    if (i === 0) {
      for (const k of ['name', 'address', 'city', 'postcode', 'country']) if (!d[k].trim()) bad.push(k);
      if (!/^\S+@\S+\.\S+$/.test(d.email)) bad.push('email');
    }
    if (i === 2 && d.payment === 'card') {
      if (d.card.replace(/\s/g, '').length < 12) bad.push('card');
      if (!/^\d{2} \/ \d{2}$/.test(d.expiry)) bad.push('expiry');
      if (d.cvc.length < 3) bad.push('cvc');
    }
    for (const k of bad) this.el.querySelector(`[name="${k}"]`)?.classList.add('is-invalid');
    if (bad.length) this.el.querySelector(`[name="${bad[0]}"]`)?.focus();
    return !bad.length;
  }

  #click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-exit')) return this.onExit();
    if (t.dataset.goto !== undefined) {
      this.step = +t.dataset.goto;
      return this.#render();
    }
    if (t.dataset.choice) {
      this.data[t.dataset.choice] = t.dataset.val;
      return this.#render();
    }
    if (t.dataset.next !== undefined) {
      const i = +t.dataset.next;
      if (!this.#valid(i)) return;
      this.done.add(STEPS[i]);
      this.step = i + 1;
      this.#render();
      this.el.querySelector(`[data-step="${this.step}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.hasAttribute('data-place')) {
      t.disabled = true;
      this.onPlace({ ...this.data, card: undefined, cvc: undefined, expiry: undefined });
    }
  }
}
