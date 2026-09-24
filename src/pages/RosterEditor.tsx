import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, Church, Coins, Copy, Dices, Download, Dumbbell, Flag,
  FlaskConical, Gem, Hammer, House, Info, Library, Minus, Package, Pencil, Plus, Printer, Search, Shield, Sparkles, Sprout, Sword,
  Target, Trash2, Users, Wand2, X,
} from 'lucide-react';
import { db, saveRoster } from '../lib/db';
import { RosterEngine, type EvaluatedProfile, type OptionNode, type SelView } from '../engine/roster';
import { buildSheet, profileText, type SheetItem } from '../lib/describe';
import { hintsFor } from '../lib/hints';
import { nameFor, speciesLabel } from '../lib/names';
import { Tip } from '../ui/Tip';
import { CharacterSheet } from '../ui/CharacterSheet';
import type { Force, GamePack, Roster, Selection } from '../engine/types';
import { downloadJson } from '../lib/importer';
import { Empty, OfflineBadge, Portrait, Sheet, artFor, fmtCosts, useArt } from '../ui/kit';

type Parent = { kind: 'force'; force: Force } | { kind: 'sel'; sel: Selection };

const isModelSel = (e: RosterEngine, s: Selection) => ['model', 'unit'].includes(e.info(s.id)?.eff.node.entryType ?? '');

function useRoster(rosterId: string) {
  const [state, setState] = useState<{ pack: GamePack; roster: Roster } | null | undefined>(undefined);
  const [v, setV] = useState(0);
  const engine = useRef<RosterEngine | null>(null);
  useEffect(() => {
    (async () => {
      const roster = await db.rosters.get(rosterId);
      const row = roster ? await db.packs.get(roster.packId) : undefined;
      if (!roster || !row) return setState(null);
      const e = new RosterEngine(row.pack, roster);
      // every band member gets a name
      let named = false;
      for (const f of roster.forces) for (const s of f.selections) if (!s.customName && isModelSel(e, s)) { s.customName = nameFor(e, s); named = true; }
      if (named) await saveRoster(roster);
      engine.current = e;
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

function bandRating(e: RosterEngine) {
  let total = 0, found = false;
  for (const f of e.roster.forces) for (const s of f.selections) {
    const v = e.view(s);
    const lvl = v?.profiles.find((p) => p.characteristics.some((c) => c.name === 'Level'))?.characteristics.find((c) => c.name === 'Level');
    if (lvl) { found = true; total += (Number(lvl.value) || 0) * s.number; }
  }
  return found ? total : null;
}

const label = 'text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3';

// ---------------------------------------------------------------- top bar + hero

function TopBar({ e, pack, onErrors, errorsCount, onAdd }: { e: RosterEngine; pack: GamePack; onErrors: () => void; errorsCount: number; onAdd: () => void }) {
  const r = e.roster;
  return (
    <header className="no-print sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 flex items-center gap-2">
        <Link to={`/game/${encodeURIComponent(pack.id)}`} className="btn btn-ghost !p-2" aria-label="Back to game"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1 font-display font-semibold truncate">{r.name}</div>
        <OfflineBadge />
        <button className={`btn !px-3 ${errorsCount ? '!border-danger/40 !text-danger' : '!text-ok'}`} onClick={onErrors} aria-label="Validation">
          {errorsCount ? <><AlertTriangle size={16} /> <span className="hidden sm:inline">{errorsCount} issue{errorsCount > 1 ? 's' : ''}</span><span className="sm:hidden">{errorsCount}</span></> : <><Check size={16} /> <span className="hidden sm:inline">Legal</span></>}
        </button>
        <button className="btn btn-primary hidden sm:inline-flex" onClick={onAdd}><Plus size={16} /> Add unit</button>
        <Link to={`/roster/${r.id}/cards`} className="btn btn-ghost !p-2" aria-label="Print roster" title="Print roster"><Printer size={18} /></Link>
        <button className="btn btn-ghost !p-2" aria-label="Export band" title="Export band" onClick={() => downloadJson(`${r.name}.band.json`, r)}><Download size={18} /></button>
      </div>
    </header>
  );
}

function Hero({ e, art, commit, allegiance }: { e: RosterEngine; art: Record<string, string>; commit: () => void; allegiance?: SelView }) {
  const r = e.roster;
  const pack = e.pack;
  const force = r.forces[0];
  const faction = pack.catalogues.find((c) => c.id === force?.catalogueId)?.name ?? '';
  const img = artFor(art, 'faction', faction);
  const [editing, setEditing] = useState(false);
  const totals = e.rosterCost();
  const rating = bandRating(e);
  const members = force ? force.selections.filter((s) => isModelSel(e, s)).reduce((a, s) => a + s.number, 0) : 0;
  const archetype = allegiance?.rules.find((x) => /archetype:/i.test(x.name))?.name.replace(/.*archetype:\s*/i, '');
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-card">
      {img && (
        <img src={img} alt="" className="absolute inset-y-0 right-0 h-full w-[62%] sm:w-[46%] object-cover object-top opacity-35 sm:opacity-100 [mask-image:linear-gradient(to_left,black_45%,transparent)]" />
      )}
      <div className="relative p-5 sm:p-7">
        <div className={label}>{faction}{archetype ? ` · ${archetype}` : ''}</div>
        {editing ? (
          <input autoFocus className="input !py-1 mt-1 font-display text-3xl sm:max-w-md" defaultValue={r.name}
            onBlur={(ev) => { r.name = ev.target.value || r.name; setEditing(false); commit(); }}
            onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} />
        ) : (
          <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight mt-1 sm:max-w-[60%]">
            {r.name}
            <button className="no-print align-middle ml-2 text-ink-3 hover:text-accent" onClick={() => setEditing(true)} aria-label="Rename band"><Pencil size={16} /></button>
          </h1>
        )}
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
          {rating != null && (
            <Tip as="span" title="Band rating" content="The total of every member's Level. Used to balance games between bands." className="w-[4.5rem] h-[4.5rem] rounded-full border-2 border-ink/80 bg-card grid place-items-center text-center shrink-0">
              <span><b className="block font-display text-3xl leading-none">{rating}</b><span className="text-[9px] font-bold uppercase tracking-widest text-ink-3">Rating</span></span>
            </Tip>
          )}
          {pack.costTypes.filter((t) => !t.hidden).map((t) => <CostMeter key={t.id} name={t.name} value={totals[t.id] ?? 0} limit={r.costLimits[t.id]} />)}
          <div>
            <div className={label}>Members</div>
            <div className="font-display text-2xl font-semibold leading-tight">{members}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CostMeter({ name, value, limit }: { name: string; value: number; limit?: number }) {
  const pct = limit ? Math.min(100, Math.max(0, (value / limit) * 100)) : 0;
  const over = limit != null && value > limit;
  return (
    <div className="min-w-[10rem]">
      <div className={label}>{name}</div>
      <div className={`font-display text-2xl font-semibold leading-tight ${over ? 'text-danger' : ''}`}>
        {value}{limit != null && <span className="text-base text-ink-3 font-sans font-medium"> / {limit}</span>}
      </div>
      {limit != null && (
        <div className="h-1.5 rounded-full bg-paper-2 mt-1 overflow-hidden w-40">
          <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- den & allegiance

const denIcons: [RegExp, typeof House][] = [
  [/study|library/i, Library], [/apothec|alchemy|occult|laborator/i, FlaskConical], [/smithy|forge/i, Hammer], [/chapel|shrine/i, Church],
  [/garden|smallholding/i, Sprout], [/archery|fletcher/i, Target], [/gym|pells|training|obstacle/i, Dumbbell], [/jewel/i, Gem],
  [/gambling/i, Coins], [/tunnel/i, House], [/magic/i, Wand2],
];
const denIcon = (name: string) => denIcons.find(([re]) => re.test(name))?.[1] ?? House;

function selDetail(v: SelView) {
  return [...v.profiles, ...v.abilities.map((a) => a.profile!).filter(Boolean)].map(profileText).concat(v.rules.map((r) => `${r.name}: ${r.description}`)).filter(Boolean).join('\n\n');
}

function DenPanel({ e, allegiance, upgrades, open, onAdd }: { e: RosterEngine; allegiance?: SelView; upgrades: SelView[]; open: (id: string) => void; onAdd: () => void }) {
  const traits = allegiance ? [...allegiance.rules, ...allegiance.abilities.map((a) => ({ id: a.id, name: a.name, description: a.profile ? profileText(a.profile) : '' }))].filter((x) => !/^allegiance/i.test(x.name)) : [];
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-display text-xl font-semibold flex-1">Den &amp; allegiance</h2>
        <button className="btn !px-3" onClick={onAdd}><Plus size={16} /> Add upgrade</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {allegiance && (
          <button onClick={() => open(allegiance.sel.id)} className="card p-4 text-left hover:border-accent transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent grid place-items-center"><Flag size={18} /></span>
              <div className="min-w-0">
                <div className={label}>Allegiance</div>
                <div className="font-semibold truncate">{allegiance.name.replace(/^allegiance:\s*/i, '')}</div>
              </div>
              {fmtCosts(e.pack, allegiance.totalCosts) && <span className="pill ml-auto">{fmtCosts(e.pack, allegiance.totalCosts)}</span>}
            </div>
            {traits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3" onClick={(ev) => ev.stopPropagation()}>
                {traits.map((t) => (
                  <Tip key={t.id} title={t.name} content={t.description || 'No rule text in the data.'} className="pill !text-[12px] !py-1 hover:ring-1 hover:ring-accent">{t.name.replace(/^allegiance archetype:\s*/i, 'Archetype: ')}</Tip>
                ))}
              </div>
            )}
          </button>
        )}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-9 h-9 rounded-xl bg-moss/15 text-moss grid place-items-center"><House size={18} /></span>
            <div>
              <div className={label}>The den</div>
              <div className="font-semibold">{upgrades.length ? `${upgrades.length} upgrade${upgrades.length > 1 ? 's' : ''}` : 'No upgrades yet'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {upgrades.map((u) => {
              const Icon = denIcon(u.name);
              return (
                <Tip key={u.sel.id} title={u.name} content={selDetail(u) || 'No rule text in the data.'}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm font-medium hover:border-accent">
                  <Icon size={16} className="text-moss" /> {u.name}{u.sel.number > 1 ? ` ×${u.sel.number}` : ''}
                </Tip>
              );
            })}
            <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-ink-3/50 px-3 py-2 text-sm text-ink-2 hover:border-accent hover:text-accent" aria-label="Add den upgrade">
              <Plus size={16} /> Upgrade
            </button>
          </div>
          {upgrades.length > 0 && <p className="text-xs text-ink-3 mt-2">Tap an upgrade to read its rule. <button className="underline" onClick={() => open(upgrades[0].sel.id)}>Manage</button></p>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- member cards

const slotIcon = (label: string) => (/weapon/i.test(label) ? Sword : /armou?r/i.test(label) ? Shield : /special/i.test(label) ? Sparkles : Package);

function MemberCard({ e, sel, art, onOpen, hasErr }: { e: RosterEngine; sel: Selection; art: Record<string, string>; onOpen: () => void; hasErr: boolean }) {
  const sheet = buildSheet(e, sel);
  if (!sheet) return null;
  const v = sheet.view;
  const hints = hintsFor(e.pack);
  const chars = sheet.unit?.characteristics ?? [];
  const level = chars.find((c) => c.name === 'Level');
  const stats = chars.filter((c) => c !== level);
  const img = artFor(art, 'unit', v.eff.node.name);
  const wounds = sel.state?.wounds ?? 0;
  const maxW = hints.wounds?.boxes ?? 0;
  const category = (e.pack.categories[v.primaryCategory ?? ''] ?? '').replace(/\s*\(.*\)/, '');
  const gear: { item: SheetItem; label: string }[] = [
    ...sheet.slots.flatMap((s) => s.items.map((item) => ({ item, label: s.label }))),
    ...sheet.otherGear.map((item) => ({ item, label: 'Other' })),
  ];
  return (
    <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onOpen())}
      className="card overflow-hidden flex min-w-0 cursor-pointer hover:border-accent/70 hover:shadow-lg hover:shadow-ink/5 transition-all">
      <div className="relative w-24 sm:w-32 shrink-0 bg-paper-2">
        {img ? <img src={img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover object-top" /> :
          <div className="absolute inset-0 grid place-items-center text-ink-3"><Portrait name={v.name} size={64} className="!bg-transparent" /></div>}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        {level && (
          <Tip as="span" title={`Level ${level.value}`} content={hints.stats.Level?.help ?? hints.levelHelp}
            className="absolute bottom-2 left-2 w-10 h-10 rounded-full bg-card border-2 border-ink/80 grid place-items-center leading-none text-center">
            <span><b className="block font-display text-lg leading-none">{level.value}</b><span className="text-[7px] font-bold uppercase tracking-wider text-ink-3">Lvl</span></span>
          </Tip>
        )}
      </div>
      <div className="min-w-0 flex-1 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold leading-tight truncate">{sel.customName || v.name}</h3>
            <div className="text-xs text-ink-3 truncate">{speciesLabel(v.name)}{category ? ` · ${category}` : ''}{sel.number > 1 ? ` · ×${sel.number}` : ''}</div>
          </div>
          {hasErr && <AlertTriangle size={16} className="text-danger shrink-0 mt-1" aria-label="Has issues" />}
          {fmtCosts(e.pack, v.totalCosts) && <span className="pill shrink-0">{fmtCosts(e.pack, v.totalCosts)}</span>}
        </div>
        {(sheet.status.length > 0 || wounds > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {sheet.status.map((s) => <Tip key={s.id} as="span" title={s.name} content={s.detail} className="pill !bg-accent !text-white">{s.name}</Tip>)}
            {wounds > 0 && maxW > 0 && <span className="pill !bg-danger/10 !text-danger">{wounds >= maxW ? 'Out of action' : `${wounds}/${maxW} wounds`}</span>}
          </div>
        )}
        {stats.length > 0 && (
          <div className="grid grid-cols-9 gap-px mt-3 rounded-lg overflow-hidden bg-line text-center" onClick={(ev) => ev.stopPropagation()}>
            {stats.map((c) => (
              <Tip key={c.typeId} as="span" title={`${c.name} · ${c.value}`} content={hints.stats[c.name]?.help} className="bg-paper py-1 min-w-0">
                <b className="block font-display text-[15px] leading-tight">{c.value}</b>
                <span className="block text-[8.5px] font-bold uppercase tracking-wide text-ink-3 leading-tight truncate">{c.name.slice(0, 3)}</span>
              </Tip>
            ))}
          </div>
        )}
        {(gear.length > 0 || sheet.skills.length + sheet.spells.length + sheet.injuries.length > 0) && (
          <div className="mt-3 space-y-1.5" onClick={(ev) => ev.stopPropagation()}>
            {gear.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {gear.map(({ item, label: l }) => {
                  const Icon = slotIcon(l);
                  return (
                    <Tip key={item.id} as="span" title={item.name} content={item.detail || 'No rule text in the data.'} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-accent">
                      <Icon size={13} className="text-ink-3" />{item.name}{item.count ? ` ×${item.count}` : ''}
                    </Tip>
                  );
                })}
              </div>
            )}
            {sheet.skills.length + sheet.spells.length + sheet.injuries.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sheet.skills.map((k) => <Tip key={k.id} as="span" title={k.name + (k.annotation ? ` (${k.annotation})` : '')} content={k.detail} className="text-[12px] rounded-md bg-paper-2 px-1.5 py-0.5 text-ink-2 hover:ring-1 hover:ring-accent">{k.name}{k.annotation ? ` (${k.annotation})` : ''}</Tip>)}
                {sheet.spells.map((k) => <Tip key={k.id} as="span" title={k.name} content={k.detail} className="text-[12px] rounded-md bg-moss/15 px-1.5 py-0.5 text-ink-2">✦ {k.name}</Tip>)}
                {sheet.injuries.map((k) => <Tip key={k.id} as="span" title={k.name} content={k.detail} className="text-[12px] rounded-md bg-danger/10 px-1.5 py-0.5 text-danger">{k.name}</Tip>)}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- add units / upgrades

function AddList({ e, force, art, commit, models, onAdded }: { e: RosterEngine; force: Force; art: Record<string, string>; commit: () => void; models: boolean; onAdded: (s: Selection) => void }) {
  const pack = e.pack;
  const [q, setQ] = useState('');
  const opts = e.options({ kind: 'force', force });
  const flat = (o: OptionNode[]): OptionNode[] => o.flatMap((x) => (x.isGroup ? flat(x.children) : [x]));
  const visible = flat(opts).filter((o) => !o.hidden && (['model', 'unit'].includes(o.eff.node.entryType ?? '') === models) && (!q || o.name.toLowerCase().includes(q.toLowerCase())));
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
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="input !pl-9" placeholder={models ? 'Search species' : 'Search upgrades'} value={q} onChange={(ev) => setQ(ev.target.value)} />
      </div>
      {[...byCat.entries()].map(([cid, list]) => {
        const lim = catLimit(cid);
        const n = counts[cid] ?? 0;
        return (
          <section key={cid} className="mb-4">
            <h3 className="px-1 py-1 text-xs font-bold uppercase tracking-wider text-ink-3 flex justify-between">
              <span>{pack.categories[cid] ?? 'Other'}</span>
              {lim != null && <span className={n >= lim ? 'text-danger' : ''}>{n}/{lim} in band</span>}
            </h3>
            <div className={models ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'space-y-1'}>
              {list.map((o) => {
                const atMax = (o.max != null && o.count >= o.max) || (lim != null && n >= lim);
                const add = () => { const s = e.add({ kind: 'force', force }, o.id); if (models) s.customName = nameFor(e, s); commit(); onAdded(s); };
                const img = artFor(art, 'unit', o.eff.node.name);
                return models ? (
                  <button key={o.id} disabled={atMax} onClick={add} aria-label={`Add ${o.name}`}
                    className="card overflow-hidden text-left group disabled:opacity-45 disabled:cursor-not-allowed hover:border-accent transition-colors">
                    <div className="aspect-[4/3] bg-paper-2 relative overflow-hidden">
                      {img ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform" /> :
                        <div className="w-full h-full grid place-items-center"><Portrait name={o.name} size={56} className="!bg-transparent" /></div>}
                      <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-card/90 grid place-items-center text-accent shadow"><Plus size={16} /></span>
                    </div>
                    <div className="p-2">
                      <div className="font-semibold text-sm leading-tight truncate">{o.name}</div>
                      <div className="text-xs text-ink-3">{fmtCosts(pack, o.cost) || 'free'}{o.max != null ? ` · ${o.count}/${o.max}` : o.count ? ` · ${o.count} in band` : ''}</div>
                    </div>
                  </button>
                ) : (
                  <div key={o.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-paper-2">
                    {(() => { const Icon = denIcon(o.name); return <span className="w-9 h-9 rounded-xl bg-moss/15 text-moss grid place-items-center shrink-0"><Icon size={17} /></span>; })()}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{o.name}</div>
                      <div className="text-xs text-ink-3">{fmtCosts(pack, o.cost) || 'free'}{o.count ? ` · ${o.count} owned` : ''}</div>
                    </div>
                    {optionDetail(e, o) && <Tip title={o.name} content={optionDetail(e, o)} className="text-ink-3 hover:text-accent p-1"><Info size={16} /></Tip>}
                    <button className="btn !p-2 shrink-0" disabled={atMax} aria-label={`Add ${o.name}`} onClick={add}><Plus size={16} /></button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {!visible.length && <p className="text-sm text-ink-3 p-4">{q ? `Nothing matches “${q}”.` : 'Nothing available to add.'}</p>}
    </div>
  );
}

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] hidden sm:block" onClick={onClose} />
      <div className="relative w-full sm:w-[480px] h-full bg-card sm:border-l border-line shadow-2xl">{children}</div>
    </div>
  );
}

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

/** Rule text for an option (selected or not), for its tooltip */
function optionDetail(e: RosterEngine, o: OptionNode): string {
  const pack = e.pack;
  const parts: string[] = [];
  for (const p of o.eff.profiles) parts.push(profileText(p as unknown as EvaluatedProfile));
  for (const l of o.eff.infoLinks) {
    if (l.type === 'rule') { const r = pack.sharedRules[l.targetId]; if (r?.description) parts.push(`${l.name || r.name}: ${r.description}`); }
    else { const p = pack.sharedProfiles[l.targetId]; if (p) parts.push((o.eff.infoLinks.length > 1 ? `${p.name}: ` : '') + profileText(p as unknown as EvaluatedProfile)); }
  }
  for (const r of o.eff.rules) if (r.description) parts.push(`${r.name}: ${r.description}`);
  if (o.eff.node.comment && !parts.length) parts.push(o.eff.node.comment);
  return parts.filter(Boolean).join('\n\n');
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
  const detail = optionDetail(e, o);
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
        {detail && <Tip title={o.name} content={detail} className="text-ink-3 hover:text-accent p-1 -m-1" ><Info size={15} /></Tip>}
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
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  if (!v) return null;
  const img = artFor(art, 'unit', v.eff.node.name);
  const opts = e.options({ kind: 'sel', sel });
  const isModel = v.eff.node.entryType === 'model' || v.eff.node.entryType === 'unit';
  return (
    <div className="scroll-y h-full relative">
      <div className="sticky top-0 z-10 h-0"><button className="absolute top-2 right-2 btn !p-2 bg-card/80 backdrop-blur" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
      {img && mode === 'view' ? (
        <div className="h-40 sm:h-48 overflow-hidden relative">
          <img src={img} alt="" className="w-full h-full object-cover object-[50%_32%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
        </div>
      ) : <div className="h-12" />}
      <div className={`px-4 pb-6 relative ${img && mode === 'view' ? '-mt-8' : ''}`}>
        {errors.length > 0 && (
          <div className="mb-3 rounded-xl bg-danger/10 text-danger text-sm p-3 space-y-1">
            {errors.map((m, i) => <div key={i} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {m}</div>)}
          </div>
        )}
        {mode === 'view' ? (
          <>
            {isModel ? <CharacterSheet e={e} sel={sel} art={art} commit={commit} onEdit={() => setMode('edit')} /> : (
              <div>
                <h2 className="font-display text-2xl font-semibold">{v.name}</h2>
                <div className="mt-3 space-y-2 text-sm">
                  {[...v.profiles, ...v.abilities.map((a) => a.profile!).filter(Boolean)].map((p) => <p key={p.id} className="whitespace-pre-line text-ink-2">{profileText(p)}</p>)}
                  {v.rules.map((r) => <p key={r.id}><b>{r.name}.</b> <span className="text-ink-2">{r.description}</span></p>)}
                </div>
                {opts.some(hasVisible) && <button className="btn mt-4" onClick={() => setMode('edit')}><Pencil size={15} /> Edit options</button>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Editing</div>
                <h2 className="font-display text-xl font-semibold truncate">{sel.customName || v.name}</h2>
              </div>
              <button className="btn btn-primary !px-3" onClick={() => setMode('view')}><Check size={15} /> Done</button>
            </div>
            {isModel && (
              <label className="block mb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Character name</span>
                <div className="flex gap-2 mt-1">
                  <input className="input" placeholder={`Name your ${speciesLabel(v.name)}…`} value={sel.customName ?? ''}
                    onChange={(ev) => { sel.customName = ev.target.value || undefined; commit(); }} />
                  <button className="btn !px-3 shrink-0" title="Suggest a name" aria-label="Suggest a name" onClick={() => { sel.customName = nameFor(e, sel); commit(); }}><Dices size={16} /></button>
                </div>
              </label>
            )}
            {v.info.length > 0 && <div className="text-xs text-accent mb-2">{v.info.join(' · ')}</div>}
            <OptionList e={e} parent={{ kind: 'sel', sel }} opts={opts} commit={commit} />
            <div className="flex gap-2 mt-6">
              <button className="btn flex-1" onClick={() => { e.duplicate(sel.id); commit(); }}><Copy size={16} /> Duplicate</button>
              <button className="btn flex-1 !text-danger" onClick={() => { e.remove(sel.id); commit(); onClose(); }}><Trash2 size={16} /> Remove</button>
            </div>
          </>
        )}
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
  const [adding, setAdding] = useState<null | 'unit' | 'upgrade'>(null);
  const [added, setAdded] = useState<string>('');
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => (e ? e.errors() : []), [e, v]);
  const closeDetail = useCallback(() => setSelId(undefined), []);
  if (state === undefined) return null;
  if (state === null || !e) return <main className="p-6"><Empty icon={<Users />} title="Band not found"><Link to="/" className="underline text-accent">Home</Link></Empty></main>;
  const force = e.roster.forces[0];
  const sel = selId ? e.info(selId)?.sel : undefined;
  const errorIds = new Set(errors.map((x) => x.selId).filter(Boolean) as string[]);
  const selErrors = sel ? errors.filter((x) => x.selId && (x.selId === sel.id || e.info(x.selId)?.root.id === sel.id)).map((x) => x.message) : [];

  // split the band: members vs allegiance / den / other
  const fe = force ? e.forceEntry(force) : undefined;
  const order = (fe?.categoryLinks ?? []).map((c) => c.targetId);
  const rank = (s: Selection) => { const i = order.indexOf(e.view(s)?.primaryCategory ?? ''); return i < 0 ? 99 : i; };
  const members = (force?.selections ?? []).filter((s) => isModelSel(e, s)).sort((a, b) => rank(a) - rank(b));
  const extras = (force?.selections ?? []).filter((s) => !isModelSel(e, s)).map((s) => e.view(s)!).filter(Boolean);
  const allegiance = extras.find((x) => /allegiance/i.test(x.name) || /allegiance/i.test(e.pack.categories[x.primaryCategory ?? ''] ?? ''));
  const upgrades = extras.filter((x) => x !== allegiance);
  const hasErr = (s: Selection) => errorIds.has(s.id) || s.children.some((c) => errorIds.has(c.id));

  return (
    <div className="min-h-dvh pb-28 sm:pb-10">
      <TopBar e={e} pack={state.pack} onErrors={() => setShowErrors(true)} errorsCount={errors.length} onAdd={() => setAdding('unit')} />
      <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-8">
        <Hero e={e} art={art} commit={commit} allegiance={allegiance} />

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-xl font-semibold flex-1">The band</h2>
            <button className="btn btn-primary" onClick={() => setAdding('unit')}><Plus size={16} /> Add unit</button>
          </div>
          {members.length === 0 ? (
            <div className="card"><Empty icon={<Users />} title="No members yet">Recruit your first creatures to start the band. <button className="text-accent font-semibold underline" onClick={() => setAdding('unit')}>Add unit</button></Empty></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {members.map((s) => <MemberCard key={s.id} e={e} sel={s} art={art} onOpen={() => setSelId(s.id)} hasErr={hasErr(s)} />)}
            </div>
          )}
        </section>

        <DenPanel e={e} allegiance={allegiance} upgrades={upgrades} open={setSelId} onAdd={() => setAdding('upgrade')} />
      </main>

      {/* mobile add button */}
      <button className="sm:hidden fixed bottom-5 right-5 z-30 btn btn-primary !rounded-full !px-5 !py-3 shadow-xl no-print safe-bottom" onClick={() => setAdding('unit')}><Plus size={18} /> Add unit</button>

      <Drawer open={!!sel} onClose={closeDetail}>
        {sel && <UnitDetail key={sel.id} e={e} sel={sel} art={art} commit={commit} onClose={closeDetail} errors={selErrors} />}
      </Drawer>

      <Sheet wide open={!!adding} onClose={() => { setAdding(null); setAdded(''); }} title={adding === 'upgrade' ? 'Add a den upgrade' : 'Add a unit'}>
        {added && <div className="mb-3 rounded-xl bg-ok/10 text-ok text-sm px-3 py-2 flex items-center gap-2"><Check size={16} /> {added}</div>}
        {force && adding && (
          <AddList e={e} force={force} art={art} commit={commit} models={adding === 'unit'}
            onAdded={(s) => { const vv = e.view(s); setAdded(adding === 'unit' ? `${s.customName} the ${speciesLabel(vv?.name ?? '')} joined the band` : `${vv?.name} added to the den`); }} />
        )}
      </Sheet>

      <Sheet open={showErrors} onClose={() => setShowErrors(false)} title={errors.length ? `${errors.length} issue${errors.length > 1 ? 's' : ''}` : 'All good'}>
        {errors.length ? (
          <ul className="space-y-2">
            {errors.map((x, i) => (
              <li key={i}>
                <button className="w-full text-left card p-3 text-sm flex gap-2 hover:border-accent" onClick={() => { if (x.selId) { const root = e.info(x.selId)?.root.id; if (root) setSelId(root); } setShowErrors(false); }}>
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
