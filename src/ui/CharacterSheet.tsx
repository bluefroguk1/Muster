// Read-only "character sheet" for one band member, modelled on the rulebook's roster sheet:
// name/species, level, wound track, fate/XP, nine stat shields, skills & spells, six equipment slots.
import { Dices, Minus, Pencil, Plus, Skull } from 'lucide-react';
import { nameFor } from '../lib/names';
import type { RosterEngine } from '../engine/roster';
import type { Selection } from '../engine/types';
import { buildSheet, type SheetItem } from '../lib/describe';
import { hintsFor, statShort } from '../lib/hints';
import { Tip } from './Tip';
import { Portrait, artFor, fmtCosts } from './kit';

function Chip({ item, tone = 'default' }: { item: SheetItem; tone?: 'default' | 'spell' | 'bad' | 'status' }) {
  const toneCls = {
    default: 'bg-paper-2 text-ink',
    spell: 'bg-[color-mix(in_srgb,var(--color-moss)_18%,transparent)] text-ink',
    bad: 'bg-danger/10 text-danger',
    status: 'bg-accent text-white',
  }[tone];
  return (
    <Tip title={item.name + (item.annotation ? ` (${item.annotation})` : '')} content={item.detail || 'No rule text in the data.'}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${toneCls} hover:ring-2 hover:ring-accent/40`}>
      {item.name}{item.annotation ? <span className="opacity-70">({item.annotation})</span> : null}
    </Tip>
  );
}

function Ribbon({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3 mb-2 flex items-center gap-2"><span className="h-px flex-1 bg-line" />{children}<span className="h-px flex-1 bg-line" /></h3>;
}

export function CharacterSheet({ e, sel, art, commit, onEdit, printable }: {
  e: RosterEngine; sel: Selection; art: Record<string, string>; commit?: () => void; onEdit?: () => void; printable?: boolean;
}) {
  const sheet = buildSheet(e, sel);
  if (!sheet) return null;
  const { view: v, unit } = sheet;
  const hints = hintsFor(e.pack);
  const pack = e.pack;
  const species = v.name;
  const category = pack.categories[v.primaryCategory ?? ''] ?? '';
  const level = unit?.characteristics.find((c) => c.name === 'Level');
  const stats = unit?.characteristics.filter((c) => c !== level) ?? [];
  const st = sel.state ?? {};
  const setState = (patch: Partial<NonNullable<Selection['state']>>) => { sel.state = { ...st, ...patch }; commit?.(); };
  const w = hints.wounds;
  const editable = !!commit && !printable;

  // lay equipment out like the paper sheet: Weapon 1, Weapon 2, Armour 1, Armour 2, Item, Special
  const lines: { label: string; item?: SheetItem; cont?: boolean }[] = [];
  for (const slot of sheet.slots) {
    const items = [...slot.items];
    for (let i = 0; i < slot.capacity; i++) {
      const it = items.shift();
      const label = slot.capacity > 1 ? `${slot.label} ${i + 1}` : slot.label;
      lines.push({ label, item: it });
      if (it && slot.label === 'Armour' && /heavy armou?r/i.test(it.name) && i + 1 < slot.capacity) {
        i++; lines.push({ label: `${slot.label} ${i + 1}`, item: it, cont: true });
      }
    }
    for (const extra of items) lines.push({ label: `${slot.label} (extra)`, item: extra });
  }

  return (
    <div className={`${printable ? '' : 'pb-6'}`}>
      {/* ---------------- header: name row, then portrait / species / level */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Name</label>
          {editable ? (
            <div className="flex items-end gap-1.5">
            <input className="w-full bg-transparent font-display text-2xl font-semibold leading-tight border-b border-dashed border-line focus:border-accent focus:outline-none placeholder:text-ink-3/70"
              placeholder={`Name your ${species.replace(/\s*\(.*\)/, '')}…`} value={sel.customName ?? ''}
              onChange={(ev) => { sel.customName = ev.target.value || undefined; commit?.(); }} aria-label="Character name" />
              <button className="btn btn-ghost !p-1.5 shrink-0 text-ink-3 hover:text-accent no-print" title="Suggest another name" aria-label="Suggest another name"
                onClick={() => { sel.customName = nameFor(e, sel); commit?.(); }}><Dices size={17} /></button>
            </div>
          ) : (
            <div className="font-display text-2xl font-semibold leading-tight border-b border-line">{sel.customName || <span className="text-ink-3">&nbsp;</span>}</div>
          )}
        </div>
        {onEdit && !printable && (
          <button className="btn !px-3 shrink-0 no-print" onClick={onEdit}><Pencil size={15} /> Edit</button>
        )}
      </div>
      <div className="flex gap-3 items-center mt-3">
        <Portrait src={artFor(art, 'unit', v.eff.node.name)} name={species} size={printable ? 56 : 68} className="ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 mr-1.5">Species</span><b className="text-ink">{species}</b>
          </div>
          {category && <div className="text-xs text-ink-3">{category}</div>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {sheet.status.map((s) => <Chip key={s.id} item={s} tone="status" />)}
            {fmtCosts(pack, v.totalCosts) && <span className="pill">{fmtCosts(pack, v.totalCosts)}</span>}
          </div>
        </div>
        {level && (
          <Tip as="span" title="Level" content={hints.stats.Level?.help ?? hints.levelHelp}
            className="shrink-0 w-16 h-16 rounded-full border-2 border-ink/80 grid place-items-center text-center bg-card">
            <span><b className="block font-display text-2xl leading-none">{level.value}</b><span className="text-[9px] font-bold uppercase tracking-widest text-ink-3">Level</span></span>
          </Tip>
        )}
      </div>

      {/* ---------------- wounds / fate / xp */}
      {(w || hints.fateHelp) && (
        <div className="mt-4 flex flex-wrap gap-3 items-stretch">
          {w && (
            <div className="flex-1 min-w-[12rem]">
              <Tip as="span" title="Wounds" content={w.help} className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 inline-flex items-center gap-1">Wounds · {st.wounds ?? 0}/{w.boxes}</Tip>
              <div className="grid grid-cols-8 gap-1 mt-1">
                {Array.from({ length: w.boxes }, (_, i) => i + 1).map((n) => {
                  const marked = (st.wounds ?? 0) >= n;
                  const shaded = w.shaded.includes(n);
                  return (
                    <button key={n} disabled={!editable} onClick={() => setState({ wounds: (st.wounds ?? 0) === n ? n - 1 : n })}
                      className={`h-7 rounded-md text-[11px] font-semibold border transition-colors ${marked ? 'bg-danger text-white border-danger' : shaded ? 'bg-ink/15 border-ink/25 text-ink-2' : 'bg-card border-line text-ink-3'} ${editable ? 'hover:border-danger' : ''}`}
                      aria-label={`Wound ${n}${shaded ? ' (−1 to Roll-offs)' : ''}`}>
                      {marked ? '✕' : n}
                    </button>
                  );
                })}
              </div>
              {(st.wounds ?? 0) >= w.boxes && <div className="text-xs text-danger mt-1 flex items-center gap-1"><Skull size={12} /> Out of Action</div>}
            </div>
          )}
          {hints.fateHelp && (
            <div className="flex gap-2">
              {([['fate', 'Fate', hints.fateHelp], ['xp', 'Exp', hints.xpHelp]] as const).map(([k, label, help]) => (
                <div key={k} className="rounded-xl border border-line px-2 py-1.5 text-center min-w-[5.5rem]">
                  <Tip as="span" title={label === 'Exp' ? 'Experience' : label} content={help} className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">{label}</Tip>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    {editable && <button className="btn !p-1" aria-label={`Less ${label}`} onClick={() => setState({ [k]: Math.max(0, (st[k] ?? 0) - 1) })}><Minus size={12} /></button>}
                    <b className="font-display text-xl w-7">{st[k] ?? 0}</b>
                    {editable && <button className="btn !p-1" aria-label={`More ${label}`} onClick={() => setState({ [k]: (st[k] ?? 0) + 1 })}><Plus size={12} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- stats */}
      {stats.length > 0 && (
        <div className="mt-5">
          <Ribbon>Statistics</Ribbon>
          <div className="grid grid-cols-3 sm:grid-cols-9 lg:grid-cols-3 xl:grid-cols-3 gap-2">
            {stats.map((c) => {
              const h = hints.stats[c.name];
              return (
                <Tip key={c.typeId} title={`${c.name} · ${c.value}`} content={h?.help ?? `The model's ${c.name} statistic.`}
                  className="shield group relative flex flex-col items-center pt-2 pb-3 bg-paper-2 hover:bg-accent/15 transition-colors">
                  <b className="font-display text-2xl leading-none">{c.value}</b>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ink-2 leading-none">{c.name}</span>
                  <span className="sr-only">({statShort(hints, c.name)})</span>
                </Tip>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- skills & spells */}
      <div className="mt-5">
        <Ribbon>Skills, spells etc</Ribbon>
        {sheet.skills.length + sheet.spells.length + sheet.injuries.length === 0 ? (
          <p className="text-sm text-ink-3 text-center">No skills yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sheet.skills.map((s) => <Chip key={s.id} item={s} />)}
            {sheet.spells.map((s) => <Chip key={s.id} item={s} tone="spell" />)}
            {sheet.injuries.map((s) => <Chip key={s.id} item={s} tone="bad" />)}
          </div>
        )}
      </div>

      {/* ---------------- equipment */}
      {(lines.length > 0 || sheet.otherGear.length > 0) && (
        <div className="mt-5">
          <Ribbon>Equipment</Ribbon>
          <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 min-h-10">
                <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-3">{l.label}</span>
                {l.item ? (
                  l.cont ? <span className="text-sm text-ink-3 italic">(takes both slots)</span> :
                  <Tip title={l.item.name} content={l.item.detail || 'No rule text in the data.'} className="text-sm font-medium text-left hover:text-accent underline decoration-dotted decoration-ink-3/60 underline-offset-4">
                    {l.item.name}{l.item.count ? ` ×${l.item.count}` : ''}
                  </Tip>
                ) : <span className="text-sm text-ink-3/60">—</span>}
                <span className="ml-auto text-[11px] text-ink-3/60 font-display">{i + 1}</span>
              </div>
            ))}
            {sheet.otherGear.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-3">Other</span>
                <Tip title={g.name} content={g.detail} className="text-sm font-medium text-left underline decoration-dotted underline-offset-4">{g.name}</Tip>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
