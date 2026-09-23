// Art: pull illustrations out of the user's own ePUB rulebook and store them locally.
// Nothing is bundled with the app; images live only in this browser's IndexedDB.
import JSZip from 'jszip';
import { db, type ArtRow } from './db';
import type { GamePack } from '../engine/types';

interface Img { path: string; alt: string; order: number }
export interface ArtRule { kind: ArtRow['kind']; name: string; match: string[] }

/** Hand-picked matches for Burrows & Badgers (matched against image alt text) */
const BURROWS_RULES: ArtRule[] = [
  { kind: 'faction', name: 'Royalists', match: ['badger knight in armour'] },
  { kind: 'faction', name: 'Rogues', match: ['rabbit dressed as a pirate'] },
  { kind: 'faction', name: 'Freebeasts', match: ['fox dressed as a historical figure'] },
  { kind: 'faction', name: 'Kindred', match: ['squirrel dressed as an archer'] },
  { kind: 'faction', name: 'Witch Hunters', match: ['hedgehog dressed in medieval armor'] },
  { kind: 'faction', name: 'Wildlings', match: ['plant growing from its head'] },
  { kind: 'faction', name: 'Arcane Conclave', match: ['owl wearing a wizard'] },
  { kind: 'faction', name: 'Undead', match: ['undead warrior'] },
  { kind: 'faction', name: 'Routiers', match: ['squirrel dressed as a medieval knight'] },
  { kind: 'faction', name: 'Hillfolk', match: ['hare dressed in scottish'] },
  { kind: 'faction', name: 'Campaign', match: ['windmill'] },
  { kind: 'unit', name: 'Badger', match: ['badger in a robe', 'badger'] },
  { kind: 'unit', name: 'Hare', match: ['hare dressed in scottish'] },
  { kind: 'unit', name: 'Rabbit', match: ['rabbit warriors', 'rabbit'] },
  { kind: 'unit', name: 'Mouse/ Dormouse', match: ['mouse dressed as a knight', 'mouse'] },
  { kind: 'unit', name: 'Shrew', match: ['mouse wearing a top hat'] },
  { kind: 'unit', name: 'Black Rat', match: ['rat archer'] },
  { kind: 'unit', name: 'Great Brown Rat', match: ['rat dressed in elaborate'] },
  { kind: 'unit', name: 'Hedgehog', match: ['stirring a cauldron', 'hedgehog'] },
  { kind: 'unit', name: 'Squirrel', match: ['squirrel dressed as an archer'] },
  { kind: 'unit', name: 'Otter', match: ['otter in medieval armor', 'otter'] },
  { kind: 'unit', name: 'Fox', match: ['fox character dressed as a lumberjack', 'fox'] },
  { kind: 'unit', name: 'Fennec Fox (Rare)', match: ['fox and the other a rat'] },
  { kind: 'unit', name: 'Frog', match: ['frog holding a hammer'] },
  { kind: 'unit', name: 'Toad', match: ['frog-like creatures'] },
  { kind: 'unit', name: 'Mole', match: ['mole wearing glasses', 'mole'] },
  { kind: 'unit', name: 'Ferret / Polecat', match: ['ferret'] },
  { kind: 'unit', name: 'Weasel / Stoat', match: ['rodent dressed as a rogue'] },
  { kind: 'unit', name: 'Cat', match: ['cat dressed in medieval attire'] },
  { kind: 'unit', name: 'Wildcat', match: ['a cat and a bear'] },
  { kind: 'unit', name: 'Hound (Medium)', match: ['small dog dressed as a pirate'] },
  { kind: 'unit', name: 'Hound (Large)', match: ['wolf-like creature'] },
  { kind: 'unit', name: 'Hound (Massive)', match: ['dog and a gnome'] },
  { kind: 'unit', name: 'Bird (Small)', match: ['bird characters'] },
  { kind: 'unit', name: 'Bird (Medium)', match: ['bird dressed in a coat'] },
  { kind: 'unit', name: 'Bird (Large)', match: ['owl wearing a hat'] },
  { kind: 'unit', name: 'Bird (Massive)', match: ['owl with a hat attacks'] },
  { kind: 'unit', name: 'Raptor (Large)', match: ['large eagle'] },
  { kind: 'unit', name: 'Raptor (Massive)', match: ['winged creatures'] },
  { kind: 'unit', name: 'Noctule Bat', match: ['bat holding'] },
  { kind: 'unit', name: 'Mist Ghast (Small/ Medium)', match: ['ghasts'] },
  { kind: 'unit', name: 'Mist Ghast (Large)', match: ['skeletal frames'] },
  { kind: 'unit', name: 'Mist Ghast (Massive)', match: ['skeletal lizard'] },
  { kind: 'unit', name: 'Green Lizard (Rare)', match: ['reptilian creatures'] },
  { kind: 'unit', name: 'Beaver', match: ['boar'] },
  { kind: 'unit', name: 'Tracker Grub', match: ['caterpillar-like'] },
  { kind: 'unit', name: 'Attack Grub', match: ['caterpillar-like'] },
  { kind: 'unit', name: 'Damping Grub', match: ['caterpillar-like'] },
];

export function rulesFor(pack: GamePack): ArtRule[] {
  return /burrows/i.test(pack.name) ? BURROWS_RULES : [];
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
