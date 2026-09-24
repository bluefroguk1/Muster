#!/usr/bin/env node
// Build the personal art bundle from your own rulebook ePUB:
//   npm run art -- path/to/rulebook.epub
// Writes public/art/<slug>/manifest.json + webp images. public/art/ is git-ignored:
// the art is for your own builds only and is never committed or published from the repo.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';

const rules = JSON.parse(fs.readFileSync(new URL('../src/lib/art-rules.json', import.meta.url)));
const epub = process.argv[2];
const slug = process.argv[3] ?? 'burrows-badgers';
if (!epub) { console.error('Usage: npm run art -- <book.epub> [slug]'); process.exit(1); }
const game = rules.games.find((g) => g.slug === slug);
if (!game) { console.error(`No art rules for "${slug}" in src/lib/art-rules.json`); process.exit(1); }

const zip = await JSZip.loadAsync(fs.readFileSync(epub));
const docs = Object.keys(zip.files).filter((p) => /\.x?html?$/i.test(p)).sort();
const imgs = [];
for (const p of docs) {
  const html = await zip.files[p].async('string');
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = m[0].match(/src="([^"]+)"/i)?.[1];
    const alt = (m[0].match(/alt="([^"]*)"/i)?.[1] ?? '').replace(/&#x0027;/g, "'").replace(/&amp;/g, '&');
    if (!src) continue;
    const full = new URL(src, 'file:///' + dir).pathname.slice(1);
    if (zip.files[full]) imgs.push({ path: full, alt });
  }
}
const skip = /table|icon of an abstract|schematic|grid of|stat sheet|character sheet/i;
const pics = imgs.filter((i) => !skip.test(i.alt));
const out = path.resolve('public/art', slug);
fs.mkdirSync(out, { recursive: true });
const done = new Map();
let n = 0;
const save = async (p) => {
  if (done.has(p)) return done.get(p);
  const file = `img-${String(++n).padStart(3, '0')}.webp`;
  await sharp(await zip.files[p].async('nodebuffer')).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(out, file));
  done.set(p, file);
  return file;
};
const pick = (keys) => { for (const k of keys) { const h = pics.find((p) => p.alt.toLowerCase().includes(k.toLowerCase())); if (h) return h; } };
const manifest = { cover: undefined, faction: {}, unit: {}, scene: [] };
const opf = Object.keys(zip.files).find((p) => p.endsWith('.opf'));
if (opf) {
  const x = await zip.files[opf].async('string');
  const id = x.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/)?.[1];
  const href = id && (x.match(new RegExp(`<item[^>]+id="${id}"[^>]+href="([^"]+)"`))?.[1] ?? x.match(new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${id}"`))?.[1]);
  const base = opf.includes('/') ? opf.slice(0, opf.lastIndexOf('/') + 1) : '';
  if (href && zip.files[base + href]) manifest.cover = await save(base + href);
}
for (const r of game.rules) {
  const hit = pick(r.match);
  if (!hit) { console.warn(`  no match for ${r.kind} "${r.name}"`); continue; }
  manifest[r.kind][r.name] = await save(hit.path);
}
for (const p of pics.filter((p) => /scene|group of/i.test(p.alt)).slice(0, 8)) manifest.scene.push(await save(p.path));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
const bytes = fs.readdirSync(out).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
console.log(`Wrote ${n} images (${(bytes / 1e6).toFixed(1)} MB) to ${path.relative(process.cwd(), out)}`);
