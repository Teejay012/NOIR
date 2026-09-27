// Downloads the Higgsfield-generated assets listed in assets.json and optimises them for the web.
//   images → public/assets/img/<id>.webp   (alpha preserved)
//   models → public/assets/models/<id>.glb (meshopt geometry, 1024px webp textures)
// Usage: npm run assets   (add --force to re-download)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/assets.json'), 'utf8'));
const force = process.argv.includes('--force');
const raw = join(root, 'assets-src');
const out = join(root, 'public/assets');
for (const d of [join(raw, 'img'), join(raw, 'models'), join(out, 'img'), join(out, 'models')]) mkdirSync(d, { recursive: true });

async function download(url, file) {
  if (existsSync(file) && !force) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      if (attempt >= 4) throw new Error(`download failed for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
}

const bin = join(root, 'node_modules/.bin/gltf-transform');

await Promise.all(
  Object.entries(manifest.images).map(async ([id, url]) => {
    const src = join(raw, 'img', `${id}.png`);
    await download(url, src);
    const wide = id === 'hall';
    await sharp(src)
      .resize({ width: wide ? 2400 : 1200, withoutEnlargement: true })
      .webp({ quality: wide ? 80 : 86, alphaQuality: 90 })
      .toFile(join(out, 'img', `${id}.webp`));
    console.log('img  ', id);
  }),
);

for (const [id, url] of Object.entries(manifest.models)) {
  const src = join(raw, 'models', `${id}.glb`);
  await download(url, src);
  const dst = join(out, 'models', `${id}.glb`);
  execFileSync(
    bin,
    ['optimize', src, dst, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'],
    { stdio: 'ignore' },
  );
  console.log('model', id);
}
console.log('done →', out);
