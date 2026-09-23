import Dexie, { type Table } from 'dexie';
import type { GamePack, Roster } from '../engine/types';

export interface PackRow {
  id: string;
  name: string;
  revision: number;
  pack: GamePack;
  updatedAt: string;
}

export interface ArtRow {
  key: string; // `${packId}|${kind}|${name}`
  packId: string;
  kind: 'cover' | 'faction' | 'unit' | 'scene';
  name: string;
  blob: Blob;
}

class MusterDB extends Dexie {
  packs!: Table<PackRow, string>;
  rosters!: Table<Roster, string>;
  art!: Table<ArtRow, string>;
  constructor() {
    super('muster');
    this.version(1).stores({
      packs: 'id, name',
      rosters: 'id, packId, updatedAt',
      art: 'key, packId, kind',
    });
  }
}

export const db = new MusterDB();

export async function savePack(pack: GamePack) {
  await db.packs.put({ id: pack.id, name: pack.name, revision: pack.revision, pack, updatedAt: new Date().toISOString() });
}

export async function saveRoster(r: Roster) {
  await db.rosters.put(JSON.parse(JSON.stringify(r)));
}
