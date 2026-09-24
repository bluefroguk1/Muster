import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '../lib/db';
import { RosterEngine } from '../engine/roster';
import type { GamePack, Roster } from '../engine/types';
import { CharacterSheet } from '../ui/CharacterSheet';
import { Tip } from '../ui/Tip';
import { profileText } from '../lib/describe';
import { artFor, fmtCosts, useArt } from '../ui/kit';

/** Printable band roster, laid out like the rulebook's Band Roster sheets */
export function Cards() {
  const { rosterId = '' } = useParams();
  const [st, setSt] = useState<{ pack: GamePack; roster: Roster } | null>(null);
  useEffect(() => {
    (async () => {
      const roster = await db.rosters.get(rosterId);
      const row = roster && (await db.packs.get(roster.packId));
      if (roster && row) setSt({ pack: row.pack, roster });
    })();
  }, [rosterId]);
  const art = useArt(st?.pack.id);
  if (!st) return null;
  const e = new RosterEngine(st.pack, st.roster);
  const force = st.roster.forces[0];
  const models = force.selections.filter((s) => ['model', 'unit'].includes(e.info(s.id)?.eff.node.entryType ?? ''));
  const others = force.selections.filter((s) => !models.includes(s)).map((s) => e.view(s)!).filter(Boolean);
  const cat = st.pack.catalogues.find((c) => c.id === force.catalogueId);
  const allegiance = others.find((v) => /allegiance/i.test(v.name));
  const den = others.filter((v) => v !== allegiance);
  const rating = models.reduce((a, s) => a + (Number(e.view(s)?.profiles[0]?.characteristics.find((c) => c.name === "Level")?.value) || 0) * s.number, 0);
  const archetype = allegiance?.rules.find((r) => /archetype:/i.test(r.name))?.name.replace(/.*archetype:\s*/i, '');
  const hero = artFor(art, 'faction', cat?.name ?? '');
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="no-print flex items-center gap-2 mb-6">
        <Link to={`/roster/${rosterId}`} className="btn btn-ghost"><ArrowLeft size={16} /> Back to band</Link>
        <button className="btn btn-primary ml-auto" onClick={() => print()}><Printer size={16} /> Print / save PDF</button>
      </div>
      <header className="card p-5 mb-4 print-card overflow-hidden relative">
        {hero && <img src={hero} alt="" className="absolute right-0 top-0 h-full w-40 object-cover object-top opacity-25 [mask-image:linear-gradient(to_left,black,transparent)]" />}
        <div className="relative grid sm:grid-cols-[1fr_auto] gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Band name</div>
            <h1 className="text-3xl font-semibold">{st.roster.name}</h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
              <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Allegiance</div>{cat?.name}</div>
              {archetype && <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Archetype</div>{archetype}</div>}
              <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Cost</div>{fmtCosts(st.pack, e.rosterCost(), { showZero: true })}</div>
              <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Models</div>{models.length}</div>
            </div>
          </div>
          <div className="w-20 h-20 rounded-full border-2 border-ink/80 grid place-items-center text-center self-start">
            <span><b className="block font-display text-3xl leading-none">{rating}</b><span className="text-[9px] font-bold uppercase tracking-widest text-ink-3">Rating</span></span>
          </div>
        </div>
        {den.length > 0 && (
          <div className="relative mt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 mb-1">Den upgrades & band</div>
            <div className="flex flex-wrap gap-1.5">
              {den.map((v) => (
                <Tip key={v.sel.id} title={v.name} content={[...v.profiles, ...v.abilities.map((a) => a.profile!).filter(Boolean)].map(profileText).join('\n\n') || v.rules.map((r) => r.description).join('\n')} className="pill !text-sm !py-1">{v.name}</Tip>
              ))}
            </div>
          </div>
        )}
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {models.map((s) => (
          <article key={s.id} className="card p-4 print-card">
            <CharacterSheet e={e} sel={s} art={art} printable />
          </article>
        ))}
      </div>
    </main>
  );
}
