# NOIR — The Store That You Explore

> **Don't browse the store. Enter it.**
> NOIR — Shopping, reimagined as an experience.

NOIR is a one-page flagship store built in WebGL. There is no Home → Shop → Product → Cart. You walk through one continuous space, find objects on pedestals, inspect them the way you would in a museum, configure them, and claim them. The store remembers what you did.

The rhythm is deliberate: **silence → discovery → interaction → spectacle → calm → purchase.**

## The journey

| # | Moment | What happens |
|---|---|---|
| 01 | **Arrival** | Black screen. `WELCOME TO NOIR` → `THE STORE IS OPEN.` The hall materialises from the floor up; a monumental N-01 silhouette hangs on the horizon. `ENTER STORE ↓` |
| 02 | **Showroom** | Five spaces side by side: `MOTION`, `FORM`, `OBJECTS`, `AFTER DARK`, `YOUR COLLECTION`. Scroll, drag, swipe or use the arrow keys to move between them. |
| 03 | **The store responds** | A light follows your cursor, objects turn toward you, dust parts around the pointer, the camera leans with you. Hover an object: `N-01` → `EXPLORE OBJECT`. |
| 04 | **Product discovery** | The camera travels to the pedestal and the room goes quiet. Drag to rotate, scroll or pinch to zoom. Numbered hotspots (`01 MATERIAL`, `02 SOLE`, `03 DETAIL`) fly the camera to that part of the object. |
| 05 | **The product changes** | `COLOR`, `SIZE`, `FINISH`. Changing a colour sends a scan line up the object and re-materialises it; finish changes roughness and clearcoat in place. |
| 06 | **The price reacts** | $240 → $260 → $280, rolling as the configuration changes. |
| 07 | **Claim object** | The object lifts off its pedestal, spins and flies into the bag. `ADDED TO YOUR COLLECTION`. The counter becomes `01`. |
| 08 | **The showroom remembers** | Go back: the pedestal is empty and reads `SOLD`. Remove the item from your bag and it re-materialises. |
| 09 | **Discovery system** | While you inspect, a related object lights up in the room — `YOU MAY LIKE THIS`. Follow it; the store builds a trail. |
| 10 | **The secret room** | Somewhere in After Dark there is a tiny `◈`. Click it. The wall parts. **THE ARCHIVE** — one-of-one pieces. *Not everything is meant to be found.* |
| 11 | **The drop** | `NEXT DROP 00:07:42`. After Dark is only silhouettes. Hold the clock to advance time. In the last 30 seconds the lights flicker on; at `00:00` everything goes silent, then the collection is revealed. |
| 12 | **Limited mechanic** | `07 / 100` → claim → `08 / 100`. Other collectors are simulated, so counters creep up while the drop is live. |
| 13 | **The bag** | A restrained glass panel. Live thumbnails render the exact colour and finish you claimed. `− 1 +`, and `YOU MAY ALSO LIKE` sends you straight back into the showroom. |
| 14 | **Checkout** | The environment fades out and everything turns to paper. Four calm steps: Details, Delivery, Payment, Confirm → `CLAIM ORDER`. |
| 15 | **Object claimed** | Black. Your object alone, slowly rotating. `OBJECT CLAIMED` · `ORDER #NOIR-0821` · `SEE YOU IN THE STORE.` |
| 16 | **After checkout** | Your purchases stand on plinths in **YOUR COLLECTION**, marked `OWNED`. |
| 17 | **Mobile** | Swipe → move object to object. Tap → inspect. Pinch → zoom. Swipe down → return. Configuration lives in a bottom sheet. Lower render quality tier, same experience. |

State is persisted in `localStorage` (bag, owned objects, inventory, drop clock, archive), so the store is the same when you come back. It greets returning visitors with `WELCOME BACK TO NOIR`.

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
`NOIR.state` is not global, but `window.NOIR` exposes the app for poking around, e.g. `NOIR.inspect('n01')` or `NOIR.openArchive()`.
To start fresh, clear the `noir:v1` key in localStorage.

## How it's built

- **Vite + vanilla JS**, **three.js** for the world, **GSAP** for choreography. No framework.
- `src/gl/world.js` — the space: zones, pedestals, light beams, horizon monument, the archive behind a sliding wall, camera choreography, picking, drag / pinch / wheel input, post-processing (bloom, grain, vignette).
- `src/gl/product.js` — loads and normalises each generated GLB onto a pedestal, snaps hotspots to the surface with raycasts, and creates independent replicas for the collection, thumbnails and the confirmation screen.
- `src/gl/productMaterial.js` — patches the PBR materials so an object can **transform**: tint that keeps the texture's detail, a scan-line sweep between colours, a floor-up reveal, a silhouette mode for the locked drop and a recommendation glow.
- `src/gl/thumbs.js` — renders each configured object into a small image for the bag and checkout.
- `src/state.js` — the store's memory: bag, orders, owned objects, limited inventory, drop clock, archive.
- `src/sound.js` — all sound is synthesised with Web Audio (room tone, ticks, whooshes, a chime). Off by default.
- `src/ui/checkout.js` — the calm, paper-white checkout. `src/ui/lite.js` — a 2D fallback when WebGL is unavailable.

Accessibility: every interactive thing is a real `<button>`, keyboard navigation works throughout (`←` `→` to move, `Esc` to go back, `Enter` to enter), and `prefers-reduced-motion` shortens transitions.
