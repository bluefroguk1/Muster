import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, ImagePlus, Loader2, Plus, RefreshCw, Swords, Trash2, Upload } from 'lucide-react';
import { db, saveRoster, savePack } from '../lib/db';
import { RosterEngine, newRoster } from '../engine/roster';
import { importArtFromEpub } from '../lib/art';
import { downloadJson, importFromGithub } from '../lib/importer';
import { Empty, Portrait, Sheet, artFor, usePack, useArt, fmtCosts } from '../ui/kit';
import type { Catalogue, GamePack, Roster } from '../engine/types';

function NewRoster({ pack, cat, onClose }: { pack: GamePack; cat: Catalogue | null; onClose: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [catId, setCatId] = useState(cat?.id ?? '');
  const limits = pack.costTypes.filter((c) => !c.hidden);
  const [limit, setLimit] = useState<Record<string, number>>(() => Object.fromEntries(limits.map((c) => [c.id, c.defaultLimit])));
  const factions = pack.catalogues.filter((c) => !c.library && c.forceEntries.length);
  const create = async () => {
    const c = factions.find((f) => f.id === catId);
    if (!c) return;
    const r = newRoster(pack, name.trim() || `${c.name} band`);
    Object.assign(r.costLimits, limit);
    const e = new RosterEngine(pack, r);
    e.newForce(c.id);
    await saveRoster(r);
    nav(`/roster/${r.id}`);
  };
  return (
    <Sheet open onClose={onClose} title="New band">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink-2" htmlFor="rn">Name</label>
          <input id="rn" className="input mt-1" placeholder="The Thornwood Irregulars" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <span className="text-sm font-medium text-ink-2">Faction</span>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {factions.map((f) => (
              <button key={f.id} className={`btn justify-start !text-left ${catId === f.id ? '!border-accent !bg-paper-2' : ''}`} onClick={() => setCatId(f.id)}>{f.name}</button>
            ))}
          </div>
        </div>
        {limits.map((t) => (
          <div key={t.id}>
            <label className="text-sm font-medium text-ink-2" htmlFor={`l-${t.id}`}>{t.name} limit</label>
            <input id={`l-${t.id}`} type="number" inputMode="numeric" className="input mt-1" value={limit[t.id] ?? ''} onChange={(e) => setLimit({ ...limit, [t.id]: Number(e.target.value) })} />
          </div>
        ))}
        <button className="btn btn-primary w-full" disabled={!catId} onClick={create}>Create band</button>
      </div>
    </Sheet>
  );
}

function RosterRow({ r, pack }: { r: Roster; pack: GamePack }) {
  const e = new RosterEngine(pack, structuredClone(r));
  const cat = pack.catalogues.find((c) => c.id === r.forces[0]?.catalogueId);
  const errors = e.errors().length;
  return (
    <Link to={`/roster/${r.id}`} className="card p-4 flex items-center gap-3 hover:border-accent">
      <div className="w-10 h-10 rounded-full bg-paper-2 grid place-items-center text-accent"><Swords size={18} /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{r.name}</div>
        <div className="text-xs text-ink-3">{cat?.name} · {fmtCosts(pack, e.rosterCost(), { showZero: true })}</div>
      </div>
      {errors > 0 && <span className="pill !bg-danger/10 !text-danger">{errors} issue{errors > 1 ? 's' : ''}</span>}
    </Link>
  );
}

export function GamePage() {
  const { packId = '' } = useParams();
  const pack = usePack(decodeURIComponent(packId));
  const art = useArt(pack?.id);
  const rosters = useLiveQuery(() => db.rosters.where('packId').equals(decodeURIComponent(packId)).reverse().sortBy('updatedAt'), [packId]);
  const [newFor, setNewFor] = useState<Catalogue | null | false>(false);
  const [busy, setBusy] = useState('');
  const nav = useNavigate();
  if (pack === undefined) return null;
  if (pack === null) return <main className="max-w-6xl mx-auto p-4"><Empty icon={<Swords />} title="Game not found"><Link className="text-accent underline" to="/">Back to games</Link></Empty></main>;
  const factions = pack.catalogues.filter((c) => !c.library && c.forceEntries.length);
  const cover = artFor(art, 'cover', 'cover');

  const onArt = async (f?: File) => {
    if (!f) return;
    try { const n = await importArtFromEpub(f, pack, setBusy); setBusy(''); alertish(`Imported ${n} images`); }
    catch (e) { setBusy(''); alertish((e as Error).message); }
  };
  const alertish = (m: string) => { setBusy(m); setTimeout(() => setBusy(''), 3000); };
  const update = async () => {
    if (!pack.source?.url) return;
    try { const p = await importFromGithub(pack.source.url, setBusy); await savePack(p); alertish(`Updated to revision ${p.revision}`); }
    catch (e) { alertish((e as Error).message); }
  };
  const importRoster = async (f?: File) => {
    if (!f) return;
    const r = JSON.parse(await f.text()) as Roster;
    r.id = crypto.randomUUID();
    r.packId = pack.id;
    await saveRoster(r);
    nav(`/roster/${r.id}`);
  };
  const remove = async () => {
    if (!confirm(`Remove ${pack.name} and its art? Your bands are kept.`)) return;
    await db.packs.delete(pack.id);
    await db.art.where('packId').equals(pack.id).delete();
    nav('/');
  };

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden border-b border-line">
        {cover && <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-[1px]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/70 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 pt-6 pb-8">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={16} /> Games</Link>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-3">{pack.name}</h1>
          <p className="text-ink-2 text-sm mt-1">Revision {pack.revision}{pack.source?.url ? <> · <a className="underline" href={pack.source.url} target="_blank" rel="noreferrer">source</a></> : null}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn btn-primary" onClick={() => setNewFor(null)}><Plus size={16} /> New band</button>
            <label className="btn cursor-pointer"><ImagePlus size={16} /> Add art from ePUB<input type="file" accept=".epub" className="sr-only" onChange={(e) => onArt(e.target.files?.[0])} /></label>
            {pack.source?.kind === 'github' && <button className="btn" onClick={update}><RefreshCw size={16} /> Update</button>}
            <label className="btn cursor-pointer"><Upload size={16} /> Import band<input type="file" accept=".json" className="sr-only" onChange={(e) => importRoster(e.target.files?.[0])} /></label>
            <button className="btn" onClick={() => downloadJson(`${pack.name}.muster.json`, pack)}><Download size={16} /> Export pack</button>
            <button className="btn btn-ghost text-danger" onClick={remove}><Trash2 size={16} /></button>
          </div>
          {busy && <p className="mt-3 text-sm text-ink-2 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {busy}</p>}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4">
        {rosters && rosters.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold mb-3">Your bands</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rosters.map((r) => <RosterRow key={r.id} r={r} pack={pack} />)}</div>
          </section>
        )}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Factions</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {factions.map((f) => {
              const img = artFor(art, 'faction', f.name);
              return (
                <button key={f.id} onClick={() => setNewFor(f)} className="card overflow-hidden text-left group hover:border-accent">
                  <div className="aspect-[3/4] bg-paper-2 grain overflow-hidden">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform" /> :
                      <div className="w-full h-full grid place-items-center"><Portrait name={f.name} size={72} /></div>}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold leading-tight">{f.name}</div>
                    <div className="text-xs text-ink-3 mt-0.5">Start a band</div>
                  </div>
                </button>
              );
            })}
          </div>
          {!Object.keys(art).length && (
            <p className="text-sm text-ink-3 mt-4">Tip: add art from your own copy of the rulebook ePUB to illustrate factions and units. Images stay on this device.</p>
          )}
        </section>
      </div>
      {newFor !== false && <NewRoster pack={pack} cat={newFor} onClose={() => setNewFor(false)} />}
    </main>
  );
}
