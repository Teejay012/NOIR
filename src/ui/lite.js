// Fallback for devices without WebGL: the same store, bag and checkout, as a quiet 2D gallery.
import { ZONES, PRODUCTS, assetUrl, defaultConfig, priceOf, money } from '../data.js';
import * as store from '../state.js';

export function startLite(app) {
  const el = document.querySelector('#lite');
  const render = () => {
    el.innerHTML = ZONES.filter((z) => z.id !== 'collection')
      .map((z) => {
        const items = PRODUCTS.filter((p) => p.zone === z.id);
        const locked = z.id === 'afterdark' && !store.state.dropRevealed;
        return `<h2>${z.index} — ${z.name}</h2><div class="lite-grid">${items
          .map((p) => {
            const claimed = store.isClaimed(p.id);
            return `<button class="lite-card" type="button" data-lite="${p.id}" ${claimed || locked ? 'disabled' : ''}>
              <img alt="${p.code} ${p.name}" src="${assetUrl.image(p.id)}" style="${locked ? 'filter:brightness(0)' : ''}">
              <p class="mono">${p.code} — ${p.name}</p>
              <p class="mono">${locked ? 'LOCKED' : claimed ? 'SOLD' : `${money(priceOf(p, defaultConfig(p)))} · CLAIM`}</p></button>`;
          })
          .join('')}</div>`;
      })
      .join('');
  };
  el.hidden = false;
  document.body.classList.remove('is-arriving');
  document.body.classList.add('is-showroom');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lite]');
    if (!b) return;
    const p = PRODUCTS.find((x) => x.id === b.dataset.lite);
    store.claim(p.id, defaultConfig(p));
    app.toast('ADDED TO YOUR COLLECTION');
  });
  store.on(render);
  render();
}
