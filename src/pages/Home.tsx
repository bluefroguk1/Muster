import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, GitBranch as Github, Plus, Upload, Swords, Loader2 } from 'lucide-react';
import { db, savePack } from '../lib/db';
import { importFromFiles, importFromGithub } from '../lib/importer';
import { Empty, Sheet, artFor, useArt } from '../ui/kit';
import type { PackRow } from '../lib/db';

const SUGGESTED = [
  { label: 'Burrows & Badgers 2nd Ed (Westy661)', url: 'https://github.com/Westy661/Burrows-Badgers-Second-Edition' },
  { label: 'Burrows & Badgers 2nd Ed (rules-review)', url: 'https://github.com/bluefroguk1/Burrows-Badgers-Second-Edition/tree/rules-review' },
];

export function AddGame({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [tab, setTab] = useState<'github' | 'files'>('github');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<import('../engine/types').GamePack>) => {
    setErr('');
    try {
      const pack = await f();
      await savePack(pack);
      setBusy('');
      onClose();
      nav(`/game/${encodeURIComponent(pack.id)}`);
    } catch (e) {
      setBusy('');
      setErr((e as Error).message);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a game">
      <div className="flex gap-1 p-1 bg-paper-2 rounded-xl mb-4">
        {(['github', 'files'] as const).map((t) => (
          <button key={t} className={`flex-1 btn !py-2 ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'github' ? <><Github size={16} /> From GitHub</> : <><Upload size={16} /> From files</>}
          </button>
        ))}
      </div>
      {tab === 'github' ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setBusy('Starting…'); run(() => importFromGithub(url, setBusy)); }}>
          <label className="text-sm font-medium text-ink-2" htmlFor="gh">Repository URL</label>
          <input id="gh" className="input" placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button type="button" key={s.url} className="pill hover:text-ink" onClick={() => setUrl(s.url)}>{s.label}</button>
            ))}
          </div>
          <p className="text-xs text-ink-3">Works with any New Recruit / BattleScribe data repository (.gst + .cat). Add <code>/tree/branch</code> to use a branch.</p>
          <button className="btn btn-primary w-full" disabled={!url || !!busy}>{busy ? <><Loader2 className="animate-spin" size={16} /> {busy}</> : 'Import game'}</button>
        </form>
      ) : (
        <div className="space-y-3">
          <label className="card border-dashed grid place-items-center text-center p-8 cursor-pointer hover:border-accent">
            <Upload className="text-accent mb-2" />
            <span className="font-medium">Choose .gst and .cat files</span>
            <span className="text-xs text-ink-3">Also accepts .gstz / .catz / .zip, or a Muster .json game pack</span>
            <input type="file" multiple className="sr-only" accept=".gst,.cat,.gstz,.catz,.zip,.json"
              onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) { setBusy('Reading…'); run(() => importFromFiles(f, setBusy)); } }} />
          </label>
          {busy && <p className="text-sm text-ink-2 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> {busy}</p>}
        </div>
      )}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}

function GameCard({ row }: { row: PackRow }) {
  const art = useArt(row.id);
  const cover = artFor(art, 'cover', 'cover') ?? artFor(art, 'faction', row.pack.catalogues[0]?.name ?? '');
  const factions = row.pack.catalogues.filter((c) => !c.library && c.forceEntries.length).length;
  return (
    <Link to={`/game/${encodeURIComponent(row.id)}`} className="card overflow-hidden group hover:border-accent transition-colors">
      <div className="aspect-[16/9] bg-paper-2 grain relative overflow-hidden">
        {cover ? <img src={cover} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> :
          <div className="absolute inset-0 grid place-items-center text-ink-3"><BookOpen size={36} /></div>}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-lg leading-tight">{row.name}</h3>
        <p className="text-sm text-ink-3 mt-1">{factions} factions · revision {row.revision}</p>
      </div>
    </Link>
  );
}

export function Home() {
  const packs = useLiveQuery(() => db.packs.toArray(), []);
  const rosters = useLiveQuery(() => db.rosters.orderBy('updatedAt').reverse().limit(6).toArray(), []);
  const [adding, setAdding] = useState(false);
  return (
    <main className="max-w-6xl mx-auto px-4 pb-16">
      <section className="py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Muster your band.</h1>
        <p className="text-ink-2 mt-2 max-w-xl">Build warbands and armies for your tabletop games — on your phone or desktop, online or off.</p>
      </section>

      {rosters && rosters.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Continue</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rosters.map((r) => (
              <Link key={r.id} to={`/roster/${r.id}`} className="card p-4 flex items-center gap-3 hover:border-accent">
                <div className="w-10 h-10 rounded-full bg-paper-2 grid place-items-center text-accent"><Swords size={18} /></div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-xs text-ink-3">{packs?.find((p) => p.id === r.packId)?.name ?? 'Unknown game'} · {new Date(r.updatedAt).toLocaleDateString()}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Games</h2>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add game</button>
        </div>
        {packs && packs.length === 0 ? (
          <div className="card"><Empty icon={<BookOpen />} title="No games yet">Import a game from a GitHub data repository, or from .gst/.cat files. <button className="text-accent font-semibold underline" onClick={() => setAdding(true)}>Add your first game</button></Empty></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{packs?.map((p) => <GameCard key={p.id} row={p} />)}</div>
        )}
      </section>
      <AddGame open={adding} onClose={() => setAdding(false)} />
    </main>
  );
}
