import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '../lib/db';
import { RosterEngine } from '../engine/roster';
import type { GamePack, Roster } from '../engine/types';
import { Portrait, artFor, fmtCosts, useArt } from '../ui/kit';

/** Printable band sheet: one card per model, like the rulebook roster */
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
  const others = force.selections.filter((s) => !models.includes(s));
  const cat = st.pack.catalogues.find((c) => c.id === force.catalogueId);
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="no-print flex items-center gap-2 mb-6">
        <Link to={`/roster/${rosterId}`} className="btn btn-ghost"><ArrowLeft size={16} /> Back to band</Link>
        <button className="btn btn-primary ml-auto" onClick={() => print()}><Printer size={16} /> Print / save PDF</button>
      </div>
      <header className="card p-5 mb-4 print-card">
        <h1 className="text-3xl font-semibold">{st.roster.name}</h1>
        <div className="text-ink-2 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{cat?.name}</span>
          <span>{fmtCosts(st.pack, e.rosterCost(), { showZero: true })}</span>
          <span>{models.length} models</span>
        </div>
        {others.length > 0 && (
          <div className="mt-3 text-sm"><span className="text-ink-3">Band: </span>{others.map((s) => e.view(s)!.name).join(' · ')}</div>
        )}
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {models.map((s) => {
          const v = e.view(s)!;
          const unit = v.allProfiles.find((p) => p.characteristics.length > 4);
          const gear = s.children.map((c) => e.view(c)).filter((c) => c && !c.hidden && !/^setup only/i.test(c.name) && !/^cost/i.test(c.name));
          return (
            <article key={s.id} className="card p-4 print-card">
              <div className="flex gap-3 items-start">
                <Portrait src={artFor(art, 'unit', v.eff.node.name)} name={v.name} size={64} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold leading-tight">{s.customName || v.name}</h2>
                  <div className="text-sm text-ink-3">{s.customName ? v.name + ' · ' : ''}{fmtCosts(st.pack, v.totalCosts)}</div>
                </div>
              </div>
              {unit && (
                <table className="w-full mt-3 text-center text-sm border-collapse">
                  <thead><tr>{unit.characteristics.map((c) => <th key={c.typeId} className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold pb-1">{c.name.slice(0, 3)}</th>)}</tr></thead>
                  <tbody><tr>{unit.characteristics.map((c) => <td key={c.typeId} className="font-display text-lg border border-line py-1">{c.value}</td>)}</tr></tbody>
                </table>
              )}
              {(v.allAbilities.length > 0 || v.allRules.length > 0) && (
                <p className="text-sm mt-3"><span className="text-ink-3">Skills: </span>{[...v.allAbilities, ...v.allRules].map((r) => r.name.replace(/\s*\(X\)$/, '') + (r.annotation ? ` (${r.annotation})` : '')).join(', ')}</p>
              )}
              {gear.length > 0 && <p className="text-sm mt-1"><span className="text-ink-3">Equipment &amp; upgrades: </span>{gear.map((g) => g!.name + (g!.sel.number > 1 ? ` ×${g!.sel.number}` : '')).join(', ')}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-3">
                <div className="border border-dashed border-line rounded-lg p-2 h-12">Wounds</div>
                <div className="border border-dashed border-line rounded-lg p-2 h-12">Fate / XP</div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
