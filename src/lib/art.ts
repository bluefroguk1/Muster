// Art bundled with this (personal) build, served from public/art/<slug>/.
import artRules from './art-rules.json';
import type { ArtRow } from './db';
import type { GamePack } from '../engine/types';

export interface ArtRule { kind: ArtRow['kind']; name: string; match: string[] }

/** Which bundled art set belongs to which game */
export const ART_GAMES = artRules.games as { match: string; slug: string; rules: ArtRule[] }[];

export function gameArt(pack: GamePack) {
  return ART_GAMES.find((g) => new RegExp(g.match, 'i').test(pack.name));
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
