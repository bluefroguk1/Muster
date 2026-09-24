// Art: pull illustrations out of the user's own ePUB rulebook and store them locally.
// Nothing is bundled with the app; images live only in this browser's IndexedDB.
import JSZip from 'jszip';
import artRules from './art-rules.json';
import { db, type ArtRow } from './db';
import type { GamePack } from '../engine/types';

interface Img { path: string; alt: string; order: number }
export interface ArtRule { kind: ArtRow['kind']; name: string; match: string[] }

/** Hand-picked matches for Burrows & Badgers (matched against image alt text) */
export const ART_GAMES = artRules.games as { match: string; slug: string; rules: ArtRule[] }[];

export function gameArt(pack: GamePack) {
  return ART_GAMES.find((g) => new RegExp(g.match, 'i').test(pack.name));
}
export function rulesFor(pack: GamePack): ArtRule[] {
  return gameArt(pack)?.rules ?? [];
}

/** Art bundled with this (personal) build: public/art/<slug>/manifest.json, made by `npm run art` */
export interface ArtManifest { cover?: string; faction: Record<string, string>; unit: Record<string, string>; scene: string[] }
const manifests = new Map<string, Promise<ArtManifest | null>>();
export function bundledArt(pack: GamePack): Promise<ArtManifest | null> {
  const g = gameArt(pack);
  if (!g) return Promise.resolve(null);
  if (!manifests.has(g.slug)) {
    const base = `${import.meta.env.BASE_URL}art/${g.slug}/`;
    manifests.set(g.slug, fetch(base + 'manifest.json').then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const m = (await r.json()) as ArtManifest;
      const abs = (f: string) => base + f;
      return { cover: m.cover && abs(m.cover), faction: Object.fromEntries(Object.entries(m.faction).map(([k, v]) => [k, abs(v)])), unit: Object.fromEntries(Object.entries(m.unit).map(([k, v]) => [k, abs(v)])), scene: m.scene.map(abs) };
    }).catch(() => null));
  }
  return manifests.get(g.slug)!;
}

async function listImages(zip: JSZip): Promise<{ imgs: Img[]; cover?: string }> {
  const docs = Object.keys(zip.files).filter((p) => /\.x?html?$/i.test(p)).sort();
  const imgs: Img[] = [];
  let order = 0;
  for (const p of docs) {
    const html = await zip.files[p].async('string');
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = tag.match(/src="([^"]+)"/i)?.[1];
      const alt = (tag.match(/alt="([^"]*)"/i)?.[1] ?? '').replace(/&#x0027;/g, "'").replace(/&amp;/g, '&');
      if (!src) continue;
      const path = new URL(src, 'file:///' + dir).pathname.slice(1);
      if (!zip.files[path]) continue;
      imgs.push({ path, alt, order: order++ });
    }
  }
  // cover: OPF <meta name="cover"> or first image
  let cover: string | undefined;
  const opf = Object.keys(zip.files).find((p) => p.endsWith('.opf'));
  if (opf) {
    const x = await zip.files[opf].async('string');
    const id = x.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/)?.[1];
    const href = id ? x.match(new RegExp(`<item[^>]+id="${id}"[^>]+href="([^"]+)"`))?.[1] ?? x.match(new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${id}"`))?.[1] : undefined;
    const base = opf.includes('/') ? opf.slice(0, opf.lastIndexOf('/') + 1) : '';
    if (href && zip.files[base + href]) cover = base + href;
  }
  cover ??= imgs[0]?.path;
  return { imgs, cover };
}

async function shrink(blob: Blob, max = 900): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await c.convertToBlob({ type: 'image/webp', quality: 0.82 });
  } catch {
    return blob;
  }
}

/** Extract art from an ePUB for a pack. Returns number of images stored. */
export async function importArtFromEpub(file: File, pack: GamePack, progress: (m: string) => void = () => {}): Promise<number> {
  progress('Opening ePUB…');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const { imgs, cover } = await listImages(zip);
  const skip = /table|icon of an abstract|schematic|grid of|stat sheet|character sheet/i;
  const pics = imgs.filter((i) => !skip.test(i.alt));
  const rows: ArtRow[] = [];
  const used = new Map<string, Blob>();
  const load = async (path: string) => {
    if (!used.has(path)) used.set(path, await shrink(await zip.files[path].async('blob')));
    return used.get(path)!;
  };
  if (cover) rows.push({ key: `${pack.id}|cover|cover`, packId: pack.id, kind: 'cover', name: 'cover', blob: await load(cover) });

  const pick = (keys: string[]) => {
    for (const k of keys) {
      const hit = pics.find((p) => p.alt.toLowerCase().includes(k.toLowerCase()));
      if (hit) return hit;
    }
    return undefined;
  };
  const rules = rulesFor(pack);
  for (const [i, r] of rules.entries()) {
    const hit = pick(r.match);
    if (!hit) continue;
    progress(`Matching art ${i + 1}/${rules.length}…`);
    rows.push({ key: `${pack.id}|${r.kind}|${r.name}`, packId: pack.id, kind: r.kind, name: r.name, blob: await load(hit.path) });
  }
  // Generic fallback: any model entry whose first word appears in an alt text
  const have = new Set(rows.map((r) => r.name));
  const models = Object.values(pack.nodes).filter((n) => n.kind === 'entry' && n.entryType === 'model');
  for (const m of models) {
    if (have.has(m.name)) continue;
    const word = m.name.toLowerCase().split(/[^a-z]+/).find((w) => w.length > 3);
    if (!word) continue;
    const hit = pics.find((p) => new RegExp(`\\b${word}`, 'i').test(p.alt));
    if (hit) { rows.push({ key: `${pack.id}|unit|${m.name}`, packId: pack.id, kind: 'unit', name: m.name, blob: await load(hit.path) }); have.add(m.name); }
  }
  // A handful of scenes for backgrounds
  for (const p of pics.filter((p) => /scene|group of/i.test(p.alt)).slice(0, 8)) {
    rows.push({ key: `${pack.id}|scene|${p.order}`, packId: pack.id, kind: 'scene', name: String(p.order), blob: await load(p.path) });
  }
  progress('Saving…');
  await db.art.where('packId').equals(pack.id).delete();
  await db.art.bulkPut(rows);
  return rows.length;
}

const urlCache = new Map<string, string>();
export function artUrl(row?: ArtRow): string | undefined {
  if (!row) return undefined;
  const hit = urlCache.get(row.key);
  if (hit) return hit;
  const u = URL.createObjectURL(row.blob);
  urlCache.set(row.key, u);
  return u;
}
