import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, HardDrive, Upload } from 'lucide-react';
import { db } from '../lib/db';
import { downloadJson } from '../lib/importer';
import type { GamePack, Roster } from '../engine/types';

export function Settings() {
  const counts = useLiveQuery(async () => ({ packs: await db.packs.count(), rosters: await db.rosters.count() }), []);
  const [msg, setMsg] = useState('');
  const backup = async () => {
    downloadJson(`muster-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      format: 'muster-backup', version: 1,
      packs: (await db.packs.toArray()).map((p) => p.pack),
      rosters: await db.rosters.toArray(),
    });
  };
  const restore = async (f?: File) => {
    if (!f) return;
    const data = JSON.parse(await f.text()) as { format: string; packs: GamePack[]; rosters: Roster[] };
    if (data.format !== 'muster-backup') return setMsg('Not a Muster backup file');
    await db.transaction('rw', db.packs, db.rosters, async () => {
      for (const p of data.packs) await db.packs.put({ id: p.id, name: p.name, revision: p.revision, pack: p, updatedAt: new Date().toISOString() });
      await db.rosters.bulkPut(data.rosters);
    });
    setMsg(`Restored ${data.packs.length} games and ${data.rosters.length} bands`);
  };
  const [est, setEst] = useState('');
  useEffect(() => { navigator.storage?.estimate?.().then((e) => setEst(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used`)).catch(() => {}); }, [counts]);
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <section className="card p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2"><HardDrive size={18} /> On this device</h2>
        <p className="text-sm text-ink-2 mt-1">
          {counts ? `${counts.packs} games · ${counts.rosters} bands` : '…'} {est && `· ${est}`}
        </p>
        <p className="text-sm text-ink-3 mt-2">Muster works fully offline. Everything is stored in this browser; back up to move bands to another device.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="btn" onClick={backup}><Download size={16} /> Back up games &amp; bands</button>
          <label className="btn cursor-pointer"><Upload size={16} /> Restore backup<input type="file" accept=".json" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} /></label>
        </div>
        {msg && <p className="text-sm mt-3 text-ok">{msg}</p>}
      </section>
    </main>
  );
}
