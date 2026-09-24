#!/usr/bin/env node
// Build the personal art bundle from your own copy of the rulebook:
//   npm run art -- path/to/rulebook.epub [slug]
// Writes public/art/<slug>/manifest.json + webp images. public/art/ is git-ignored:
// the art is for your own builds only and is never committed or published from the repo.
//
// Which picture goes with which faction/unit is set in src/lib/art-rules.json.
// Illustrations are framed automatically: the figure is found against the plain
// background and cropped so the head sits near the top. Photos use a hand-set crop.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';

const cfg = JSON.parse(fs.readFileSync(new URL('../src/lib/art-rules.json', import.meta.url)));
const [book, slug = 'burrows-badgers'] = process.argv.slice(2);
if (!book) { console.error('Usage: npm run art -- <rulebook> [slug]'); process.exit(1); }
const game = cfg.games.find((g) => g.slug === slug);
if (!game) { console.error(`No art rules for "${slug}" in src/lib/art-rules.json`); process.exit(1); }

// every <img> in reading order
const zip = await JSZip.loadAsync(fs.readFileSync(book));
const docs = Object.keys(zip.files).filter((p) => /\.x?html?$/i.test(p)).sort();
const imgs = [];
for (const p of docs) {
  const html = await zip.files[p].async('string');
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = m[0].match(/src="([^"]+)"/i)?.[1];
    imgs.push(src ? new URL(src, 'file:///' + dir).pathname.slice(1) : null);
  }
}
const out = path.resolve('public/art', slug);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/\.(webp|json)$/.test(f)) { try { fs.unlinkSync(path.join(out, f)); } catch { /* keep going */ } }

const buffers = new Map();
async function load(i) {
  if (!buffers.has(i)) {
    const p = imgs[i];
    if (!p || !zip.files[p]) throw new Error(`image #${i} not found`);
    buffers.set(i, await zip.files[p].async('nodebuffer'));
  }
  return buffers.get(i);
}

/** Find the figure on a plain illustration background. Returns image-space box + head x. */
async function subject(buf) {
  const meta = await sharp(buf).metadata();
  const W = 200, H = Math.round((meta.height / meta.width) * W);
  const { data } = await sharp(buf).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // background = median of the border pixels
  const border = [];
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) border.push(y * W + x);
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) border.push(y * W + x);
  const med = [0, 1, 2].map((c) => border.map((i) => data[i * 3 + c]).sort((a, b) => a - b)[border.length >> 1]);
  const fg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.abs(data[i * 3] - med[0]) + Math.abs(data[i * 3 + 1] - med[1]) + Math.abs(data[i * 3 + 2] - med[2]);
    fg[i] = d > 60 ? 1 : 0;
  }
  const rows = Array.from({ length: H }, (_, y) => { let s = 0; for (let x = 0; x < W; x++) s += fg[y * W + x]; return s; });
  const cols = Array.from({ length: W }, (_, x) => { let s = 0; for (let y = 0; y < H; y++) s += fg[y * W + x]; return s; });
  const maxRow = Math.max(...rows);
  // top = first row with real mass (skips thin staffs/spears poking up), bottom/left/right = any mass
  const top = rows.findIndex((r) => r > maxRow * 0.18);
  const bottom = H - 1 - [...rows].reverse().findIndex((r) => r > 2);
  const left = cols.findIndex((c) => c > 2), right = W - 1 - [...cols].reverse().findIndex((c) => c > 2);
  // head x = centre of mass across the top quarter of the figure
  let sx = 0, n = 0;
  const band = Math.max(4, Math.round((bottom - top) * 0.22));
  for (let y = top; y < top + band; y++) for (let x = 0; x < W; x++) if (fg[y * W + x]) { sx += x; n++; }
  const k = meta.width / W;
  return { W: meta.width, H: meta.height, top: top * k, bottom: bottom * k, left: left * k, right: right * k, headX: (n ? sx / n : (left + right) / 2) * k };
}

function clampBox(cx, top, w, h, W, H) {
  w = Math.round(Math.min(w, W)); h = Math.round(Math.min(h, H));
  let x = Math.round(cx - w / 2), y = Math.round(top);
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  return { left: x, top: y, width: Math.round(w), height: Math.round(h) };
}

/** kind 'unit' → 4:5 head-and-shoulders portrait; 'faction' → 3:4 full figure */
async function crop(spec, kind) {
  const i = typeof spec === 'number' ? spec : spec.img;
  const buf = await load(i);
  const meta = await sharp(buf).metadata();
  const aspect = kind === 'unit' ? 0.8 : 0.75;
  let box;
  if (typeof spec === 'number') {
    const s = await subject(buf);
    const fh = s.bottom - s.top;
    let h = kind === 'unit' ? fh * 0.66 : fh * 1.06;
    let w = h * aspect;
    if (w > s.W) { w = s.W; h = w / aspect; }
    box = clampBox(kind === 'unit' ? s.headX : (s.left + s.right) / 2, s.top - fh * 0.04, w, h, s.W, s.H);
  } else {
    const h = spec.h * meta.height, w = Math.min(meta.width, h * aspect);
    box = clampBox(spec.cx * meta.width, spec.top * meta.height, w, w / aspect, meta.width, meta.height);
  }
  return sharp(buf).extract(box).resize({ width: kind === 'unit' ? 480 : 600, withoutEnlargement: true });
}

let n = 0;
const cache = new Map();
async function save(key, make) {
  if (cache.has(key)) return cache.get(key);
  const file = `img-${String(++n).padStart(3, '0')}.webp`;
  await (await make()).webp({ quality: 80 }).toFile(path.join(out, file));
  cache.set(key, file);
  return file;
}
const full = (i) => save(`full:${i}`, async () => sharp(await load(i)).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }));

const manifest = { cover: undefined, faction: {}, unit: {}, scene: [] };
if (game.cover != null) manifest.cover = await full(game.cover);
for (const [name, spec] of Object.entries(game.faction ?? {})) manifest.faction[name] = await save(`f:${JSON.stringify(spec)}`, () => crop(spec, 'faction'));
for (const [name, spec] of Object.entries(game.unit ?? {})) manifest.unit[name] = await save(`u:${JSON.stringify(spec)}`, () => crop(spec, 'unit'));
for (const i of game.scenes ?? []) manifest.scene.push(await full(i));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
const bytes = fs.readdirSync(out).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
console.log(`Wrote ${n} images (${(bytes / 1e6).toFixed(1)} MB) to ${path.relative(process.cwd(), out)}`);
