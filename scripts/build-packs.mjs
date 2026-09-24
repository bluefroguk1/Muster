#!/usr/bin/env node
// Compile bundled starter games (so the app has Burrows & Badgers ready on first launch).
//   node scripts/build-packs.mjs <dir-with-gst-and-cat> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
const { compilePack } = await import('../src/engine/compile.ts');
const [dir = 'test/fixtures/bb', out = 'public/packs/burrows-badgers.json'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /\.(gst|cat)$/.test(f)).map((f) => ({ name: f, xml: fs.readFileSync(path.join(dir, f), 'utf8') }));
const pack = compilePack(files, { kind: 'github', url: 'https://github.com/bluefroguk1/Burrows-Badgers-Second-Edition/tree/rules-review', importedAt: new Date().toISOString() });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pack));
fs.writeFileSync(path.join(path.dirname(out), 'index.json'), JSON.stringify([path.basename(out)]));
console.log(`${pack.name} r${pack.revision}: ${Object.keys(pack.nodes).length} entries -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
