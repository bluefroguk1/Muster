// Turn engine selections into "character sheet" data: skills, spells, equipment slots, with rule text for tooltips.
import type { RosterEngine, EvaluatedInfo, EvaluatedProfile, SelView } from '../engine/roster';
import type { Selection } from '../engine/types';
import { hintsFor } from './hints';

export interface SheetItem {
  id: string;
  name: string;
  annotation?: string;
  kind: 'skill' | 'spell' | 'equipment' | 'injury' | 'status';
  detail: string; // tooltip text
  count?: number;
  cost?: string;
  sel?: Selection;
}

const NOISE = /^(setup only|cost \(|variable cost|piece$|free item$)/i;
const EMPTY = (v?: string) => !v || v === '-' || v === '.';

export function profileText(p: EvaluatedProfile) {
  const skip = new Set(['Rarity', 'Availability', 'Bonus level', 'Bonus Level']);
  const lines: string[] = [];
  for (const c of p.characteristics) {
    if (EMPTY(c.value) || skip.has(c.name)) continue;
    if (/^(rules|effect|description)$/i.test(c.name)) lines.push(c.value);
    else lines.unshift(`${c.name}: ${c.value}`);
  }
  return lines.join('\n');
}

function infoText(i: EvaluatedInfo) {
  return (i.description ?? (i.profile ? profileText(i.profile) : '')).trim();
}

export function isNoise(v: SelView) {
  return v.hidden || NOISE.test(v.name);
}

export interface Sheet {
  view: SelView;
  unit?: EvaluatedProfile;
  skills: SheetItem[];
  spells: SheetItem[];
  injuries: SheetItem[];
  status: SheetItem[]; // Leader, Second, Magic User…
  slots: { label: string; items: SheetItem[]; capacity: number }[];
  otherGear: SheetItem[];
}

export function buildSheet(e: RosterEngine, sel: Selection): Sheet | undefined {
  const view = e.view(sel);
  if (!view) return;
  const hints = hintsFor(e.pack);
  const unit = view.profiles.find((p) => p.characteristics.length > 4);
  const skills = new Map<string, SheetItem>();
  const spells: SheetItem[] = [];
  const injuries: SheetItem[] = [];
  const status: SheetItem[] = [];
  const slotItems = new Map<string, SheetItem[]>();
  const otherGear: SheetItem[] = [];

  const addSkill = (i: EvaluatedInfo, from?: string) => {
    const key = i.name.replace(/\s*\((X|\d+)\)$/, '');
    const prev = skills.get(key);
    const a = Number(i.annotation);
    if (prev) {
      const b = Number(prev.annotation);
      if (!isNaN(a) && !isNaN(b)) prev.annotation = String(a + b);
      return;
    }
    const m = i.name.match(/\((\d+)\)$/);
    skills.set(key, {
      id: i.id + (from ?? ''),
      name: key.replace(/\s*\(X\)$/, ''),
      annotation: i.annotation ?? m?.[1],
      kind: 'skill',
      detail: infoText(i),
    });
  };
  for (const r of [...view.abilities, ...view.rules]) addSkill(r);

  const slotOf = (s: Selection): string | undefined => {
    if (!hints.slots) return;
    const info = e.info(s.id);
    const names = (info?.groupIds ?? []).map((g) => e.pack.nodes[g]?.name ?? '');
    // Special slot wins over the weapon/item groups nested inside it
    for (const slot of [...hints.slots].sort((a) => (a.label === 'Special' ? -1 : 0))) {
      if (names.some((n) => slot.match.test(n))) return slot.label;
    }
    return undefined;
  };

  const walk = (s: Selection, underEquipment: boolean) => {
    for (const c of s.children) {
      const v = e.view(c);
      if (!v || isNoise(v)) continue;
      if (v.eff.node.entryType === 'model') continue;
      const spell = v.profiles.find((p) => p.typeName === 'Spell') ?? v.abilities.find((a) => a.profile?.typeName === 'Spell')?.profile;
      const injury = v.profiles.find((p) => p.typeName === 'Injury') ?? v.abilities.find((a) => a.profile?.typeName === 'Injury')?.profile;
      const gearProfile = v.profiles.find((p) => /weapon|armou?r|item/i.test(p.typeName));
      const slot = slotOf(c);
      if (spell) {
        spells.push({ id: c.id, name: v.name, kind: 'spell', detail: profileText(spell), sel: c });
        continue;
      }
      if (injury) {
        injuries.push({ id: c.id, name: v.name, kind: 'injury', detail: profileText(injury), sel: c });
        for (const r of [...v.abilities, ...v.rules]) if (r.name !== injury.name) addSkill(r, c.id);
        continue;
      }
      if (gearProfile || slot) {
        const extras = c.children.map((x) => e.view(x)).filter((x): x is SelView => !!x && !isNoise(x));
        const rules = [...v.rules, ...v.abilities, ...extras.flatMap((x) => [...x.rules, ...x.abilities])];
        const detail = [
          gearProfile ? profileText(gearProfile) : '',
          ...extras.filter((x) => x.profiles.length).map((x) => `${x.name}: ${profileText(x.profiles[0])}`),
          ...rules.filter((r) => r.description).map((r) => `${r.name}: ${r.description}`),
        ].filter(Boolean).join('\n\n');
        const item: SheetItem = {
          id: c.id,
          name: v.name + extras.map((x) => ` + ${x.name}`).join(''),
          kind: 'equipment',
          detail,
          count: c.number > 1 ? c.number : undefined,
          sel: c,
        };
        if (slot) (slotItems.get(slot) ?? slotItems.set(slot, []).get(slot)!).push(item);
        else otherGear.push(item);
        continue;
      }
      const isStatus = v.abilities.length === 1 && v.rules.length === 0 && v.abilities[0].name === v.name || /^(leader|second|magic user)$/i.test(v.name);
      if (isStatus) {
        status.push({ id: c.id, name: v.name, kind: 'status', detail: v.abilities.map(infoText).join('\n') || v.profiles.map(profileText).join('\n'), sel: c });
      }
      for (const r of [...v.abilities, ...v.rules]) if (!(isStatus && r.name === v.name)) addSkill(r, c.id);
      // e.g. "Magic User: Natural" abilities on archetype selections
      for (const p of v.profiles) if (p.typeName === 'Ability' || p.characteristics.length <= 1) {
        if (!/^(leader|second)$/i.test(p.name)) addSkill({ id: p.id, name: p.name, type: 'profile', profile: p, description: profileText(p) }, c.id);
      }
      walk(c, underEquipment);
    }
  };
  walk(sel, false);

  const slots = (hints.slots ?? []).map((s) => ({ label: s.label, capacity: s.count, items: slotItems.get(s.label) ?? [] }));
  return { view, unit, skills: [...skills.values()], spells, injuries, status, slots, otherGear };
}
