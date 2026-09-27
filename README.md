# NOIR — The Store That You Explore

> **Don't browse the store. Enter it.**
> NOIR — Shopping, reimagined as an experience.

NOIR is a one-page flagship store built in WebGL. Each collection is its own **world** — its own light, palette and poster — and the camera travels between them. Every object is a real 3D model you can turn, inspect, configure and claim. The store remembers what you did.

The rhythm is deliberate: **silence → discovery → interaction → spectacle → calm → purchase.**

## Design language

Cinematic product posters rather than a dark museum. Colour-graded environments, a levitating hero object, editorial serif (Cormorant Garamond) against wide-tracked sans (Manrope), glass cards, and a proper editorial grid for browsing.

| World | Mood | Poster treatment |
|---|---|---|
| **01 Motion** | A canyon at first light. Stone lifts off the ground and hangs in the air around the object. | Ultra-light, wide-tracked sans — `M O T I O N` |
| **02 Form** | Navy velvet drapery, a gold-rimmed lacquer plinth, one warm spotlight, gold dust. | Gold serif between double rules — *Tailored objects* |
| **03 Objects** | Blue hour over a lit city, a glowing turntable and glass arcs orbiting the object. | *Captivating* + heavy wide sans |
| **04 After Dark** | An eclipse. The drop is locked in silhouette until the corona ignites. | Ember serif, countdown |
| **◈ The Archive** | Hidden. Warm sediment and stone, slanted light, one-of-one pieces. | Italic serif |

As the camera moves, the whole grade blends between worlds — sky, fog, lights, bloom and even the reflections on chrome, which are re-rendered from each world's sky.

## The journey

| # | Moment | What happens |
|---|---|---|
| 01 | **Arrival** | Black. `WELCOME TO NOIR` → `THE STORE IS OPEN.` The canyon materialises at first light under a colossal N-01 silhouette. `N O I R`. *Enter the store ↓* |
| 02 | **The worlds** | Scroll, use ↑ ↓, the world pills, or swipe vertically on mobile to travel. Each world is a poster: hero object, two more in the distance, badge, glass note. |
| 03 | **The store responds** | A light follows your cursor, objects turn toward you, debris and dust part around the pointer, the camera leans with you. Drag the hero to spin it. |
| 04 | **Discovery** | Click a distant object (or ‹ › / ← →) to bring it forward. Click the hero to explore: the camera flies in, the world goes quiet. Drag, zoom, and numbered hotspots fly to the material, sole or stitching. |
| 05 | **The product changes** | Colour, size, finish. A scan line travels up the object and repaints it; finish changes roughness and clearcoat in place. |
| 06 | **The price reacts** | $240 → $260 → $280, rolling as you configure. |
| 07 | **Claim object** | The object lifts off, spins and flies into the bag. The counter pops. |
| 08 | **The store remembers** | Back in the poster the object has become a dark ghost with a rim of light — *In your bag*. Remove it and it returns to full colour. |
| 09 | **Recommendation trail** | While you inspect, a related object brightens and *You may like this* leads to it — across worlds if it has to. |
| 10 | **The secret** | A tiny `◈` lies on the floor of After Dark. Click it: the camera dives into the eclipse and comes out in **The Archive**. *Not everything is meant to be found.* |
| 11 | **The drop** | `00:07:42`. Silhouettes against a dim corona. Hold the clock to advance time; the corona builds, then everything goes silent and the collection is revealed. |
| 12 | **Limited mechanic** | `07 / 100` → `08 / 100`, with a progress bar. Other collectors are simulated while the drop is live. |
| 13 | **The bag** | A floating glass panel with live thumbnails of the exact colour and finish you claimed. `− 1 +`, and *You may also like* flies you straight back into the world. |
| 14 | **Checkout** | The world blurs away into ivory paper. Four calm steps: Details, Delivery, Payment, Confirm → *Claim order*. |
| 15 | **Object claimed** | Black. Your object alone, rotating in its world's light. *Object claimed.* `ORDER #NOIR-0821`. *See you in the store.* |
| 16 | **Your collection** | The Index opens on *Your collection*: every object you own or have claimed, rendered in your configuration. |
| — | **The Index** | An editorial grid of all objects (feature tiles, world gradients, status chips: colourways, limited counts, locked, owned). Filter by world. |
| 17 | **Mobile** | Swipe ← → between objects, ↑ ↓ between worlds. Tap to explore, pinch to zoom, swipe down to return. Configuration in a bottom sheet. |

State is persisted in `localStorage` (bag, owned objects, inventory, drop clock, archive), and returning visitors are greeted with `WELCOME BACK TO NOIR`.

This is a portfolio piece. **No payment is taken and nothing typed at checkout leaves the page.**

## Assets — generated with Higgsfield

Every product in the store was generated for this project:

- **15 product images** — GPT Image 2.5 (studio shots on transparent backgrounds), used as the source for the 3D models and as a fallback.
- **15 textured 3D models** — Tripo H3.1 image-to-3D (GLB with PBR textures).
- **3 macro detail shots** for the N-01 hotspots (material, sole, stitching) and one wide hall image used for social previews.

The URLs live in [`scripts/assets.json`](scripts/assets.json). `npm run assets` downloads them and optimises them for the web (meshopt geometry + 1024px WebP textures for models, WebP for images) into `public/assets/`.

If a model is missing, the store falls back to the product image, and then to a placeholder form, so it always runs.

## Running it

```bash
npm install
npm run assets   # download + optimise the Higgsfield assets (needs network access to the asset CDN)
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

Add `?debug` to the URL to disable GSAP lag smoothing (useful on slow or headless GPUs).
`window.NOIR` exposes the app for poking around, e.g. `NOIR.goWorld('form')`, `NOIR.inspect('n01')` or `NOIR.openArchive()`.
To start fresh, clear the `noir:v1` key in localStorage.

## How it's built

- **Vite + vanilla JS**, **three.js** for the world, **GSAP** for choreography. No framework.
- `src/gl/world.js` — the store: five worlds along one axis, poster camera and crane-shot travel, hero swaps, inspection, claim flight, drop, archive dive, picking and drag / pinch / wheel input, post (bloom, grade, grain, vignette).
- `src/gl/environments.js` — the five worlds, all procedural: layered ridge silhouettes and floating stone, animated velvet drapery, an instanced city with lit windows, an eclipse corona shader, stone monoliths and light shafts.
- `src/gl/palettes.js` + `src/gl/sky.js` — each world's colour grade and a gradient sky with sun glare and cloud banks; the camera blends palettes as it travels, and reflections are re-rendered from the blended sky.
- `src/gl/product.js` / `productMaterial.js` — loads each generated GLB, turns it to face the viewer, snaps hotspots to the surface, and patches its materials so it can transform (tint sweep, floor-up reveal, silhouette, ghost, glow).
- `src/gl/thumbs.js` — renders each configured object into a small image for the bag, checkout and collection.
- `src/state.js` — the store's memory. `src/sound.js` — synthesised Web Audio, off by default.
- `src/ui/checkout.js` — the calm ivory checkout. `src/ui/lite.js` — a 2D fallback when WebGL is unavailable.

Accessibility: every interactive thing is a real `<button>`, keyboard navigation works throughout (`↑` `↓` between worlds, `←` `→` between objects, `Enter` to explore, `Esc` to go back), and `prefers-reduced-motion` shortens transitions.
