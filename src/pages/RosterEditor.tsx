import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Download, Minus, Plus, Printer, Search, Trash2, Users, X,
} from 'lucide-react';
import { db, saveRoster } from '../lib/db';
import { RosterEngine, type OptionNode, type SelView } from '../engine/roster';
import type { Force, GamePack, Roster, Selection } from '../engine/types';
import { downloadJson } from '../lib/importer';
import { Empty, OfflineBadge, Portrait, Sheet, artFor, fmtCosts, useArt } from '../ui/kit';

type Parent = { kind: 'force'; force: Force } | { kind: 'sel'; sel: Selection };

function useRoster(rosterId: string) {
  const [state, setState] = useState<{ pack: GamePack; roster: Roster } | null | undefined>(undefined);
  const [v, setV] = useState(0);
  const engine = useRef<RosterEngine | null>(null);
  useEffect(() => {
    (async () => {
      const roster = await db.rosters.get(rosterId);
      const row = roster ? await db.packs.get(roster.packId) : undefined;
      if (!roster || !row) return setState(null);
      engine.current = new RosterEngine(row.pack, roster);
      setState({ pack: row.pack, roster });
    })();
  }, [rosterId]);
  const saveTimer = useRef<number | undefined>(undefined);
  const commit = useCallback(() => {
    engine.current?.touch();
    setV((x) => x + 1);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => engine.current && saveRoster(engine.current.roster), 300);
  }, []);
  return { state, engine: engine.current, v, commit };
}


function shortStat(name: string) {
  const known: Record<string, string> = { Movement: 'M', Strike: 'S', Block: 'B', Ranged: 'R', Nimbleness: 'N', Concealment: 'C', Awareness: 'A', Fortitude: 'F', Presence: 'P', Level: 'Lvl' };
  return known[name] ?? (name.length <= 4 ? name : name.slice(0, 3));
}

function bandRating(e: RosterEngine) {
  let total = 0, found = false;
  for (const f of e.roster.forces) for (const s of f.selections) {
    const v = e.view(s);
    const lvl = v?.profiles.find((p) => p.characteristics.some((c) => c.name === 'Level'))?.characteristics.find((c) => c.name === 'Level');
    if (lvl) { found = true; total += (Number(lvl.value) || 0) * s.number; }
  }
  return found ? total : null;
}

// ---------------------------------------------------------------- header

function Header({ e, pack, commit, onErrors, errorsCount }: { e: RosterEngine; pack: GamePack; commit: () => void; onErrors: () => void; errorsCount: number }) {
  const r = e.roster;
  const totals = e.rosterCost();
  const rating = bandRating(e);
  const [editing, setEditing] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line">
      <div className="px-3 sm:px-4 py-2 flex items-center gap-2">
        <Link to={`/game/${encodeURIComponent(pack.id)}`} className="btn btn-ghost !p-2" aria-label="Back"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input autoFocus className="input !py-1 font-display text-lg" defaultValue={r.name}
              onBlur={(ev) => { r.name = ev.target.value || r.name; setEditing(false); commit(); }}
              onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} />
          ) : (
            <button className="font-display text-lg font-semibold truncate max-w-full text-left" onClick={() => setEditing(true)} title="Rename">{r.name}</button>
          )}
          <div className="flex items-center gap-2 text-xs text-ink-3 flex-wrap">
            <span>{pack.catalogues.find((c) => c.id === r.forces[0]?.catalogueId)?.name}</span>
            {rating != null && <span className="pill">Rating {rating}</span>}
            <OfflineBadge />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          {pack.costTypes.filter((t) => !t.hidden).map((t) => <CostMeter key={t.id} name={t.name} value={totals[t.id] ?? 0} limit={r.costLimits[t.id]} />)}
        </div>
        <button className={`btn !px-3 ${errorsCount ? '!border-danger/40 !text-danger' : '!text-ok'}`} onClick={onErrors} aria-label="Validation">
          {errorsCount ? <><AlertTriangle size={16} /> {errorsCount}</> : <Check size={16} />}
        </button>
        <Link to={`/roster/${r.id}/cards`} className="btn btn-ghost !p-2" aria-label="Cards / print"><Printer size={18} /></Link>
        <button className="btn btn-ghost !p-2 hidden sm:inline-flex" aria-label="Export" onClick={() => downloadJson(`${r.name}.band.json`, r)}><Download size={18} /></button>
      </div>
      <div className="sm:hidden px-3 pb-2 flex gap-3">
        {pack.costTypes.filter((t) => !t.hidden).map((t) => <CostMeter key={t.id} name={t.name} value={totals[t.id] ?? 0} limit={r.costLimits[t.id]} />)}
      </div>
    </header>
  );
}

function CostMeter({ name, value, limit }: { name: string; value: number; limit?: number }) {
  const pct = limit ? Math.min(100, Math.max(0, (value / limit) * 100)) : 0;
  const over = limit != null && value > limit;
  return (
    <div className="min-w-[8.5rem] flex-1 sm:flex-none">
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-ink-2">{name}</span>
        <span className={over ? 'text-danger' : ''}>{value}{limit != null ? ` / ${limit}` : ''}</span>
      </div>
      {limit != null && (
        <div className="h-1.5 rounded-full bg-paper-2 mt-1 overflow-hidden">
          <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- recruit panel

function Recruit({ e, force, art, commit, onAdded }: { e: RosterEngine; force: Force; art: Record<string, string>; commit: () => void; onAdded: (s: Selection) => void }) {
  const pack = e.pack;
  const [q, setQ] = useState('');
  const opts = e.options({ kind: 'force', force });
  const flat = (o: OptionNode[]): OptionNode[] => o.flatMap((x) => (x.isGroup ? flat(x.children) : [x]));
  const visible = flat(opts).filter((o) => !o.hidden && (!q || o.name.toLowerCase().includes(q.toLowerCase())));
  const byCat = new Map<string, OptionNode[]>();
  for (const o of visible) {
    const c = o.eff.primaryCategory ?? '';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(o);
  }
  const counts = e.categoryCounts(force);
  const fe = e.forceEntry(force);
  const catLimit = (cid: string) => fe?.categoryLinks.find((c) => c.targetId === cid)?.constraints.find((k) => k.type === 'max')?.value;
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input !pl-9" placeholder="Search units and upgrades" value={q} onChange={(ev) => setQ(ev.target.value)} />
        </div>
      </div>
      <div className="scroll-y flex-1 p-2">
        {[...byCat.entries()].map(([cid, list]) => {
          const lim = catLimit(cid);
          const n = counts[cid] ?? 0;
          return (
            <section key={cid} className="mb-3">
              <h3 className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-ink-3 flex justify-between">
                <span>{pack.categories[cid] ?? 'Other'}</span>
                {lim != null && <span className={n > lim ? 'text-danger' : ''}>{n}/{lim}</span>}
              </h3>
              {list.map((o) => {
                const atMax = o.max != null && o.count >= o.max;
                return (
                  <div key={o.id} className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-paper-2">
                    <Portrait src={artFor(art, 'unit', o.eff.node.name)} name={o.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{o.name}</div>
                      <div className="text-xs text-ink-3">{fmtCosts(pack, o.cost) || 'free'}{o.max != null ? ` · ${o.count}/${o.max}` : o.count ? ` · ${o.count} in band` : ''}</div>
                    </div>
                    <button className="btn !p-2 shrink-0" disabled={atMax} aria-label={`Add ${o.name}`}
                      onClick={() => { const s = e.add({ kind: 'force', force }, o.id); commit(); onAdded(s); }}>
                      <Plus size={16} />
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
        {!visible.length && <p className="text-sm text-ink-3 p-4">Nothing matches “{q}”.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- band list

function UnitRow({ e, sel, art, selected, onClick, errorIds }: { e: RosterEngine; sel: Selection; art: Record<string, string>; selected: boolean; onClick: () => void; errorIds: Set<string> }) {
  const v = e.view(sel)!;
  const unit = v.profiles.find((p) => p.characteristics.length > 4);
  const upgrades = sel.children.map((c) => e.view(c)).filter((c): c is SelView => !!c && !c.hidden && !/^setup only/i.test(c.name));
  const hasErr = errorIds.has(sel.id) || sel.children.some((c) => errorIds.has(c.id));
  return (
    <button onClick={onClick} className={`card w-full text-left p-3 flex gap-3 transition-colors ${selected ? '!border-accent ring-2 ring-accent/20' : 'hover:border-accent/60'}`}>
      <Portrait src={artFor(art, 'unit', v.eff.node.name)} name={v.name} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight truncate">{sel.customName || v.name}{sel.number > 1 ? ` ×${sel.number}` : ''}</div>
            {sel.customName && <div className="text-xs text-ink-3">{v.name}</div>}
          </div>
          {hasErr && <AlertTriangle size={16} className="text-danger shrink-0" />}
          {fmtCosts(e.pack, v.totalCosts) && <span className="pill shrink-0">{fmtCosts(e.pack, v.totalCosts)}</span>}
        </div>
        {unit && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-ink-2">
            {unit.characteristics.map((c) => <span key={c.typeId}><span className="text-ink-3">{shortStat(c.name)}</span> <b className="font-semibold">{c.value}</b></span>)}
          </div>
        )}
        {upgrades.length > 0 && <div className="text-xs text-ink-3 mt-1 line-clamp-2">{upgrades.map((u) => u.name + (u.sel.number > 1 ? ` ×${u.sel.number}` : '')).join(' · ')}</div>}
      </div>
    </button>
  );
}

function Band({ e, art, selId, setSelId, errorIds, onRecruit }: { e: RosterEngine; art: Record<string, string>; selId?: string; setSelId: (id: string) => void; errorIds: Set<string>; onRecruit: () => void }) {
  const pack = e.pack;
  return (
    <div className="p-3 sm:p-4 space-y-6">
      {e.roster.forces.map((force) => {
        const groups = new Map<string, Selection[]>();
        for (const s of force.selections) {
          const v = e.view(s);
          if (!v) continue;
          const c = v.primaryCategory ?? '';
          if (!groups.has(c)) groups.set(c, []);
          groups.get(c)!.push(s);
        }
        const fe = e.forceEntry(force);
        const order = (fe?.categoryLinks ?? []).map((c) => c.targetId);
        const cats = [...groups.keys()].sort((a, b) => {
          const ia = order.indexOf(a), ib = order.indexOf(b);
          const ma = groups.get(a)!.every((s) => e.info(s.id)?.eff.node.entryType !== 'model');
          const mb = groups.get(b)!.every((s) => e.info(s.id)?.eff.node.entryType !== 'model');
          if (ma !== mb) return ma ? 1 : -1; // units first, upgrades (allegiance, den…) last
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        const models = force.selections.filter((s) => e.info(s.id)?.eff.node.entryType === 'model');
        return (
          <div key={force.id} className="space-y-6">
            {models.length === 0 && (
              <div className="card"><Empty icon={<Users />} title="No models yet">Recruit your first models to start the band. <button className="text-accent font-semibold underline" onClick={onRecruit}>Recruit</button></Empty></div>
            )}
            {cats.map((cid) => {
              const lim = fe?.categoryLinks.find((c) => c.targetId === cid)?.constraints.find((k) => k.type === 'max')?.value;
              const list = groups.get(cid)!;
              const n = list.reduce((a, s) => a + s.number, 0);
              return (
                <section key={cid}>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3 mb-2 flex items-center gap-2">
                    {pack.categories[cid] ?? 'Other'}
                    {lim != null && <span className={`pill ${n > lim ? '!bg-danger/10 !text-danger' : ''}`}>{n}/{lim}</span>}
                  </h2>
                  <div className="grid gap-2 xl:grid-cols-2">
                    {list.map((s) => <UnitRow key={s.id} e={e} sel={s} art={art} selected={s.id === selId} onClick={() => setSelId(s.id)} errorIds={errorIds} />)}
                  </div>
                </section>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- unit detail

function OptionList({ e, parent, opts, commit, depth = 0 }: { e: RosterEngine; parent: Parent; opts: OptionNode[]; commit: () => void; depth?: number }) {
  return (
    <div className="space-y-1">
      {opts.filter((o) => !o.hidden || o.count > 0).map((o) =>
        o.isGroup ? <OptionGroup key={o.id} e={e} parent={parent} o={o} commit={commit} depth={depth} /> : <OptionEntry key={o.id} e={e} parent={parent} o={o} commit={commit} depth={depth} siblings={opts} />,
      )}
    </div>
  );
}

function hasVisible(o: OptionNode): boolean {
  return o.isGroup ? o.children.some(hasVisible) : !o.hidden || o.count > 0;
}

function OptionGroup({ e, parent, o, commit, depth }: { e: RosterEngine; parent: Parent; o: OptionNode; commit: () => void; depth: number }) {
  const [open, setOpen] = useState(depth > 0 || o.count > 0 || (o.min ?? 0) > 0);
  if (!hasVisible(o)) return null;
  if (o.eff.node.flatten) return <OptionList e={e} parent={parent} opts={o.children} commit={commit} depth={depth} />;
  const need = (o.min ?? 0) > o.count;
  const over = o.max != null && o.count > o.max;
  return (
    <div className={`rounded-xl ${depth === 0 ? 'border border-line' : ''}`}>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={16} className="text-ink-3" /> : <ChevronRight size={16} className="text-ink-3" />}
        <span className={`font-semibold text-sm flex-1 ${o.hidden ? 'text-danger' : ''}`}>{o.name}</span>
        {(o.min != null || o.max != null) && (
          <span className={`pill ${need || over ? '!bg-danger/10 !text-danger' : ''}`}>{o.count}{o.max != null ? `/${o.max}` : ''}{need ? ' · pick' : ''}</span>
        )}
      </button>
      {o.info.length > 0 && <div className="px-9 -mt-1 pb-1 text-xs text-accent">{o.info.join(' · ')}</div>}
      {open && <div className="pl-5 pr-2 pb-2"><OptionList e={e} parent={parent} opts={o.children} commit={commit} depth={depth + 1} /></div>}
    </div>
  );
}

function OptionEntry({ e, parent, o, commit, depth, siblings }: { e: RosterEngine; parent: Parent; o: OptionNode; commit: () => void; depth: number; siblings: OptionNode[] }) {
  const sel = o.selections[0];
  const pack = e.pack;
  const single = o.max === 1 || (o.max == null && o.eff.node.entryType !== 'model' && !(o.eff.defaultAmount && o.eff.defaultAmount > 1) && o.count <= 1);
  const radioGroup = depth > 0 && siblings.every((s) => s.max === 1) && false;
  const toggle = () => {
    if (sel) { e.remove(sel.id); } else { e.add(parent, o.id); }
    commit();
  };
  const childOpts = sel ? e.options({ kind: 'sel', sel }).filter(hasVisible) : [];
  const v = sel ? e.view(sel) : undefined;
  const cost = v ? v.totalCosts : o.cost;
  return (
    <div className={`rounded-lg ${sel ? 'bg-paper-2/70' : ''}`}>
      <div className="flex items-center gap-2 px-2 py-1.5 min-h-10">
        {single || radioGroup ? (
          <button onClick={toggle} className="flex items-center gap-2 flex-1 text-left" aria-pressed={!!sel}>
            <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 ${sel ? 'bg-accent border-accent text-white' : 'border-line bg-card'}`}>{sel && <Check size={14} strokeWidth={3} />}</span>
            <span className={`text-sm ${o.hidden ? 'text-danger line-through' : ''}`}>{o.name}</span>
          </button>
        ) : (
          <>
            <span className={`text-sm flex-1 ${o.hidden ? 'text-danger' : ''}`}>{o.name}</span>
            <div className="flex items-center gap-1">
              <button className="btn !p-1.5" aria-label="Fewer" disabled={!sel} onClick={() => { if (sel) { e.setNumber(sel.id, sel.number - 1); commit(); } }}><Minus size={14} /></button>
              <input type="number" inputMode="numeric" className="input !w-14 !py-1 !px-1 text-center !text-sm" value={o.count}
                onChange={(ev) => { const n = Math.max(0, Number(ev.target.value)); if (sel) e.setNumber(sel.id, n); else if (n > 0) e.add(parent, o.id, n); commit(); }} />
              <button className="btn !p-1.5" aria-label="More" disabled={o.max != null && o.count >= o.max} onClick={() => { if (sel) e.setNumber(sel.id, sel.number + 1); else e.add(parent, o.id); commit(); }}><Plus size={14} /></button>
            </div>
          </>
        )}
        {Object.keys(cost).length > 0 && <span className="text-xs text-ink-3 whitespace-nowrap">{fmtCosts(pack, cost)}</span>}
      </div>
      {o.info.length > 0 && <div className="px-9 -mt-1 pb-1 text-xs text-accent">{o.info.join(' · ')}</div>}
      {sel && childOpts.length > 0 && (
        <div className="pl-6 pr-1 pb-2"><OptionList e={e} parent={{ kind: 'sel', sel }} opts={childOpts} commit={commit} depth={depth + 1} /></div>
      )}
    </div>
  );
}

function UnitDetail({ e, sel, art, commit, onClose, errors }: { e: RosterEngine; sel: Selection; art: Record<string, string>; commit: () => void; onClose: () => void; errors: string[] }) {
  const v = e.view(sel);
  const [openRule, setOpenRule] = useState<string | null>(null);
  if (!v) return null;
  const pack = e.pack;
  const unit = v.allProfiles.find((p) => p.characteristics.length > 4 && p.typeName === v.profiles[0]?.typeName) ?? v.profiles[0];
  const others = v.allProfiles.filter((p) => p !== unit);
  const img = artFor(art, 'unit', v.eff.node.name);
  const chips = [...v.allAbilities, ...v.allRules];
  const opts = e.options({ kind: 'sel', sel });
  return (
    <div className="scroll-y h-full relative">
      <div className="sticky top-0 z-10 h-0"><button className="absolute top-2 right-2 btn !p-2 bg-card/80 backdrop-blur" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {img ? (
        <div className="h-44 sm:h-52 overflow-hidden relative">
          <img src={img} alt="" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        </div>
      ) : <div className="h-6" />}
      <div className={`px-4 pb-6 relative ${img ? '-mt-10' : ''}`}>
        <input className="bg-transparent font-display text-2xl font-semibold w-full focus:outline-none placeholder:text-ink" placeholder={v.name}
          value={sel.customName ?? ''} onChange={(ev) => { sel.customName = ev.target.value || undefined; commit(); }} aria-label="Name" />
        <div className="flex items-center gap-2 text-sm text-ink-3 mt-0.5">
          <span>{sel.customName ? v.name : pack.categories[v.primaryCategory ?? ''] ?? ''}</span>
          <span className="pill ml-auto">{fmtCosts(pack, v.totalCosts) || '0'}</span>
        </div>
        {v.info.length > 0 && <div className="text-xs text-accent mt-1">{v.info.join(' · ')}</div>}
        {errors.length > 0 && (
          <div className="mt-3 rounded-xl bg-danger/10 text-danger text-sm p-3 space-y-1">
            {errors.map((m, i) => <div key={i} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {m}</div>)}
          </div>
        )}
        {unit && (
          <div className="stat-grid mt-4">
            {unit.characteristics.map((c) => <div key={c.typeId} className="stat"><b>{c.value}</b><span>{shortStat(c.name)}</span></div>)}
          </div>
        )}
        {chips.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button key={c.id + c.name} onClick={() => setOpenRule(openRule === c.name ? null : c.name)}
                  className={`pill !text-sm !py-1 hover:!text-ink ${openRule === c.name ? '!bg-accent !text-white' : ''}`}>
                  {c.name.replace(/\s*\(X\)$/, '')}{c.annotation ? ` (${c.annotation})` : ''}
                </button>
              ))}
            </div>
            {openRule && (
              <p className="text-sm text-ink-2 mt-2 bg-paper-2 rounded-xl p-3 whitespace-pre-line">{chips.find((c) => c.name === openRule)?.description || 'No description.'}</p>
            )}
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-4 space-y-2">
            {others.map((p) => (
              <details key={p.id + p.name} className="rounded-xl border border-line">
                <summary className="px-3 py-2 text-sm font-semibold cursor-pointer flex gap-2"><span className="text-ink-3 font-normal">{p.typeName}</span> {p.name}</summary>
                <dl className="px-3 pb-3 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {p.characteristics.filter((c) => c.value && c.value !== '-').map((c) => (<Fragment key={c.typeId}><dt className="text-ink-3">{c.name}</dt><dd className="whitespace-pre-line">{c.value}</dd></Fragment>))}
                </dl>
              </details>
            ))}
          </div>
        )}
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-3 mt-6 mb-2">Options</h3>
        <OptionList e={e} parent={{ kind: 'sel', sel }} opts={opts} commit={commit} />
        <div className="flex gap-2 mt-6">
          <button className="btn flex-1" onClick={() => { e.duplicate(sel.id); commit(); }}><Copy size={16} /> Duplicate</button>
          <button className="btn flex-1 !text-danger" onClick={() => { e.remove(sel.id); commit(); onClose(); }}><Trash2 size={16} /> Remove</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export function RosterEditor() {
  const { rosterId = '' } = useParams();
  const { state, engine: e, commit, v } = useRoster(rosterId);
  const art = useArt(state?.pack.id);
  const [selId, setSelId] = useState<string>();
  const [tab, setTab] = useState<'band' | 'recruit'>('band');
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => (e ? e.errors() : []), [e, v]);
  if (state === undefined) return null;
  if (state === null || !e) return <main className="p-6"><Empty icon={<Users />} title="Band not found"><Link to="/" className="underline text-accent">Home</Link></Empty></main>;
  const force = e.roster.forces[0];
  const sel = selId ? e.info(selId)?.sel : undefined;
  const errorIds = new Set(errors.map((x) => x.selId).filter(Boolean) as string[]);
  const selErrors = sel ? errors.filter((x) => x.selId && (x.selId === sel.id || e.info(x.selId)?.root.id === sel.id)).map((x) => x.message) : [];
  const pick = (id: string) => setSelId(id);

  return (
    <div className="h-dvh flex flex-col">
      <Header e={e} pack={state.pack} commit={commit} onErrors={() => setShowErrors(true)} errorsCount={errors.length} />
      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[300px_1fr_420px]">
        <aside className={`${tab === 'recruit' ? 'flex' : 'hidden'} lg:flex flex-col border-r border-line min-h-0 h-full bg-paper`}>
          {force && <Recruit e={e} force={force} art={art} commit={commit} onAdded={(s) => { pick(s.id); setTab('band'); }} />}
        </aside>
        <main className={`${tab === 'band' ? 'block' : 'hidden'} lg:block scroll-y h-full pb-24 lg:pb-6`}>
          <Band e={e} art={art} selId={selId} setSelId={pick} errorIds={errorIds} onRecruit={() => setTab('recruit')} />
        </main>
        <aside className="hidden lg:block border-l border-line min-h-0 h-full bg-card">
          {sel ? <UnitDetail key={sel.id} e={e} sel={sel} art={art} commit={commit} onClose={() => setSelId(undefined)} errors={selErrors} /> :
            <Empty icon={<Users />} title="Select a model">Tap a model in your band to see its profile, skills and options.</Empty>}
        </aside>
      </div>
      {/* mobile: unit sheet */}
      {sel && (
        <div className="lg:hidden fixed inset-0 z-40 bg-card flex flex-col">
          <UnitDetail key={sel.id} e={e} sel={sel} art={art} commit={commit} onClose={() => setSelId(undefined)} errors={selErrors} />
        </div>
      )}
      {/* mobile: tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-line safe-bottom no-print">
        <div className="grid grid-cols-2">
          {(['band', 'recruit'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`py-3 text-sm font-semibold flex flex-col items-center gap-0.5 ${tab === t ? 'text-accent' : 'text-ink-3'}`}>
              {t === 'band' ? <Users size={20} /> : <Plus size={20} />}{t === 'band' ? 'Band' : 'Recruit'}
            </button>
          ))}
        </div>
      </nav>
      <Sheet open={showErrors} onClose={() => setShowErrors(false)} title={errors.length ? `${errors.length} issue${errors.length > 1 ? 's' : ''}` : 'All good'}>
        {errors.length ? (
          <ul className="space-y-2">
            {errors.map((x, i) => (
              <li key={i}>
                <button className="w-full text-left card p-3 text-sm flex gap-2 hover:border-accent" onClick={() => { if (x.selId) { const root = e.info(x.selId)?.root.id; if (root) pick(root); } setShowErrors(false); }}>
                  <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" /> {x.message}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-2">Your band is legal. Nice work.</p>}
      </Sheet>
    </div>
  );
}
