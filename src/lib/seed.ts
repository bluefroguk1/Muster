import { db, savePack } from './db';
import type { GamePack } from '../engine/types';

/** Install bundled starter games (public/packs) on first launch, and refresh them when a newer revision ships. */
export async function seedPacks() {
  try {
    const base = import.meta.env.BASE_URL;
    const r = await fetch(`${base}packs/index.json`);
    if (!r.ok) return;
    const files = (await r.json()) as string[];
    for (const f of files) {
      const pack = (await (await fetch(`${base}packs/${f}`)).json()) as GamePack;
      const have = await db.packs.get(pack.id);
      if (!have || (have.pack.source?.kind === pack.source?.kind && have.revision < pack.revision)) await savePack(pack);
    }
  } catch { /* offline first run or no bundled packs */ }
}
