// Roster evaluation: applies BattleScribe-style modifiers, conditions and constraints
// to a roster built from a compiled GamePack.
import type {
  Condition, ConditionGroup, Constraint, Force, ForceEntry, GamePack, InfoLink, Modifier, Node,
  Profile, Roster, Rule, Selection,
} from './types';

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

/** An entry/group as seen through a (possible) link */
export interface Eff {
  id: string; // the id used in the tree (link id or node id)
  node: Node; // target node (entry or group)
  link?: Node;
  ids: string[]; // ids this resolves to (link id, target id)
  constraints: Constraint[];
  modifiers: Modifier[];
  categoryIds: string[];
  primaryCategory?: string;
  infoLinks: InfoLink[];
  profiles: Profile[];
  rules: Rule[];
  hidden: boolean;
  defaultAmount?: number;
  isGroup: boolean;
}

/** Container a selection lives in */
type Parent = { kind: 'force'; force: Force } | { kind: 'sel'; sel: Selection };

interface SelInfo {
  sel: Selection;
  parent: Parent;
  force: Force;
  root: Selection; // root-entry selection
  groupIds: string[]; // groups (and group links) between parent and this selection
  eff: Eff;
  depth: number;
}

/** Context in which modifiers/conditions are evaluated */
export interface Ctx {
  self?: Selection; // the selection owning the thing (undefined for unselected options)
  parent: Parent;
  force: Force;
  groupIds?: string[];
}

export interface EvaluatedProfile {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  characteristics: { typeId: string; name: string; value: string }[];
}

export interface EvaluatedInfo {
  id: string;
  name: string;
  type: 'profile' | 'rule';
  annotation?: string;
  description?: string;
  profile?: EvaluatedProfile;
}

export interface SelView {
  sel: Selection;
  name: string;
  hidden: boolean;
  costs: Record<string, number>; // own cost x number (without children)
  totalCosts: Record<string, number>; // including children
  categories: string[];
  primaryCategory?: string;
  profiles: EvaluatedProfile[];
  rules: EvaluatedInfo[];
  abilities: EvaluatedInfo[]; // profile-based infoLinks shown as abilities
  info: string[];
  eff: Eff;
  /** own + all descendant upgrades (for unit cards) */
  allProfiles: EvaluatedProfile[];
  allRules: EvaluatedInfo[];
  allAbilities: EvaluatedInfo[];
}

export interface OptionNode {
  eff: Eff;
  id: string;
  name: string;
  hidden: boolean;
  isGroup: boolean;
  groupIds: string[];
  min?: number;
  max?: number;
  count: number; // selections of this option (or within this group) in the parent
  cost: Record<string, number>;
  children: OptionNode[];
  selections: Selection[];
  info: string[];
}

export interface RosterError {
  selId?: string;
  forceId?: string;
  message: string;
  kind: 'constraint' | 'hidden' | 'cost' | 'category';
}

const cmp = (type: string, a: number, b: number) => {
  switch (type) {
    case 'atLeast': return a >= b;
    case 'greaterThan': return a > b;
    case 'atMost': return a <= b;
    case 'lessThan': return a < b;
    case 'equalTo': return a === b;
    case 'notEqualTo': return a !== b;
    default: return false;
  }
};

export class RosterEngine {
  pack: GamePack;
  roster: Roster;
  private infos = new Map<string, SelInfo>();
  private effCache = new Map<string, Eff>();
  private viewCache = new Map<string, SelView>();
  private groupPathCache = new Map<string, Map<string, string[]>>();
  private costGuard = new Set<string>();

  constructor(pack: GamePack, roster: Roster) {
    this.pack = pack;
    this.roster = roster;
    this.reindex();
  }

  // ------------------------------------------------------------ structure

  resolve(id: string): Eff {
    const hit = this.effCache.get(id);
    if (hit) return hit;
    const raw = this.pack.nodes[id];
    if (!raw) throw new Error(`Unknown entry ${id}`);
    let node = raw;
    let link: Node | undefined;
    if (raw.kind === 'link' && raw.targetId) {
      link = raw;
      node = this.pack.nodes[raw.targetId] ?? raw;
    }
    const catLinks = [...node.categoryLinks, ...(link?.categoryLinks ?? [])];
    const eff: Eff = {
      id,
      node,
      link,
      ids: link ? [link.id, node.id] : [node.id],
      constraints: [...node.constraints, ...(link?.constraints ?? [])],
      modifiers: [...node.modifiers, ...(link?.modifiers ?? [])],
      categoryIds: [...new Set(catLinks.map((c) => c.targetId))],
      primaryCategory: (link?.categoryLinks.find((c) => c.primary) ?? node.categoryLinks.find((c) => c.primary))?.targetId,
      infoLinks: [...node.infoLinks, ...(link?.infoLinks ?? [])],
      profiles: [...node.profiles, ...(link?.profiles ?? [])],
      rules: [...node.rules, ...(link?.rules ?? [])],
      hidden: (link?.hidden ?? false) || node.hidden,
      defaultAmount: link?.defaultAmount ?? node.defaultAmount,
      isGroup: node.kind === 'group',
    };
    this.effCache.set(id, eff);
    return eff;
  }

  /** children of an entry/group, with the group path from the entry down to each leaf */
  private groupPaths(parentId: string | null, force?: Force): Map<string, string[]> {
    const key = parentId ?? `force:${force?.id}`;
    const hit = this.groupPathCache.get(key);
    if (hit) return hit;
    const out = new Map<string, string[]>();
    const walk = (ids: string[], path: string[]) => {
      for (const cid of ids) {
        if (!this.pack.nodes[cid]) continue;
        const e = this.resolve(cid);
        if (e.isGroup) walk(e.node.children, [...path, ...e.ids]);
        else if (!out.has(cid)) out.set(cid, path);
      }
    };
    walk(parentId ? this.resolve(parentId).node.children : this.rootIds(force!), []);
    this.groupPathCache.set(key, out);
    return out;
  }

  rootIds(force: Force): string[] {
    const cat = this.pack.catalogues.find((c) => c.id === force.catalogueId);
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (ids: string[]) => ids.forEach((i) => { if (!seen.has(i) && this.pack.nodes[i]) { seen.add(i); out.push(i); } });
    add(this.pack.systemRootIds);
    if (cat) {
      add(cat.rootIds);
      for (const imp of cat.imports) add(this.pack.catalogues.find((c) => c.id === imp)?.rootIds ?? []);
    }
    return out;
  }

  forceEntry(force: Force): ForceEntry | undefined {
    const cat = this.pack.catalogues.find((c) => c.id === force.catalogueId);
    return cat?.forceEntries.find((f) => f.id === force.forceEntryId) ??
      this.pack.systemForceEntries.find((f) => f.id === force.forceEntryId);
  }

  reindex() {
    this.infos.clear();
    this.viewCache.clear();
    for (const force of this.roster.forces) {
      const paths = this.groupPaths(null, force);
      for (const sel of force.selections) this.indexSel(sel, { kind: 'force', force }, force, sel, paths.get(sel.nodeId) ?? [], 0);
    }
  }

  private indexSel(sel: Selection, parent: Parent, force: Force, root: Selection, groupIds: string[], depth: number) {
    if (!this.pack.nodes[sel.nodeId]) return;
    const eff = this.resolve(sel.nodeId);
    this.infos.set(sel.id, { sel, parent, force, root, groupIds, eff, depth });
    const paths = this.groupPaths(sel.nodeId);
    for (const c of sel.children) this.indexSel(c, { kind: 'sel', sel }, force, root, paths.get(c.nodeId) ?? [], depth + 1);
  }

  info(selId: string) { return this.infos.get(selId); }
  allSelections(): SelInfo[] { return [...this.infos.values()]; }

  // ------------------------------------------------------------ conditions

  private matches(si: SelInfo, id: string): boolean {
    if (si.eff.ids.includes(id) || si.groupIds.includes(id)) return true;
    if (id === 'model' || id === 'unit' || id === 'upgrade') return si.eff.node.entryType === id;
    if (this.pack.categories[id] !== undefined) return this.categoriesOf(si).includes(id);
    return false;
  }

  private descendants(sel: Selection, deep: boolean): SelInfo[] {
    const out: SelInfo[] = [];
    const walk = (s: Selection) => {
      for (const c of s.children) {
        const i = this.infos.get(c.id);
        if (!i) continue;
        out.push(i);
        if (deep) walk(c);
      }
    };
    walk(sel);
    return out;
  }

  private forceSelections(force: Force, deep: boolean): SelInfo[] {
    const out: SelInfo[] = [];
    for (const s of force.selections) {
      const i = this.infos.get(s.id);
      if (!i) continue;
      out.push(i);
      if (deep) out.push(...this.descendants(s, true));
    }
    return out;
  }

  /** selections visible from a scope */
  private scopePool(scope: string, ctx: Ctx, deep: boolean): SelInfo[] | null {
    switch (scope) {
      case 'self':
        return ctx.self ? this.descendants(ctx.self, deep) : [];
      case 'parent':
        return ctx.parent.kind === 'force'
          ? this.forceSelections(ctx.parent.force, deep)
          : this.descendants(ctx.parent.sel, deep);
      case 'root-entry': {
        const root = this.rootOf(ctx);
        return root ? this.descendants(root, deep) : [];
      }
      case 'force':
        return this.forceSelections(ctx.force, deep);
      case 'roster':
      case 'primary-catalogue':
        return this.roster.forces.flatMap((f) => this.forceSelections(f, deep));
      default: {
        // explicit ancestor entry id
        const anc = this.ancestors(ctx).find((a) => a.eff.ids.includes(scope));
        return anc ? this.descendants(anc.sel, deep) : [];
      }
    }
  }

  private rootOf(ctx: Ctx): Selection | undefined {
    if (ctx.self) return this.infos.get(ctx.self.id)?.root;
    if (ctx.parent.kind === 'sel') return this.infos.get(ctx.parent.sel.id)?.root;
    return undefined;
  }

  private ancestors(ctx: Ctx): SelInfo[] {
    const out: SelInfo[] = [];
    let p: Parent | undefined = ctx.self ? this.infos.get(ctx.self.id)?.parent : ctx.parent;
    while (p && p.kind === 'sel') {
      const i = this.infos.get(p.sel.id);
      if (!i) break;
      out.push(i);
      p = i.parent;
    }
    return out;
  }

  private tally(pool: SelInfo[], childId: string | undefined, field: string): number {
    let n = 0;
    for (const si of pool) {
      if (childId && childId !== 'any' && !this.matches(si, childId)) continue;
      if (field === 'selections') n += si.sel.number;
      else n += this.ownCost(si.sel)[field] ?? 0;
    }
    return n;
  }

  evalCondition(c: Condition, ctx: Ctx): boolean {
    if (c.type === 'instanceOf' || c.type === 'notInstanceOf') {
      let targets: SelInfo[] = [];
      if (c.scope === 'self') targets = ctx.self ? [this.infos.get(ctx.self.id)!].filter(Boolean) : [];
      else if (c.scope === 'parent') targets = ctx.parent.kind === 'sel' ? [this.infos.get(ctx.parent.sel.id)!].filter(Boolean) : [];
      else if (c.scope === 'root-entry') { const r = this.rootOf(ctx); targets = r ? [this.infos.get(r.id)!] : []; }
      else if (c.scope === 'ancestor') targets = this.ancestors(ctx);
      const hit = targets.some((t) => t && this.matches(t, c.childId ?? ''));
      return c.type === 'instanceOf' ? hit : !hit;
    }
    if (c.field === 'forces') {
      return cmp(c.type, this.roster.forces.filter((f) => !c.childId || f.forceEntryId === c.childId || f.catalogueId === c.childId).length, c.value);
    }
    const deep = c.includeChildSelections || c.scope === 'roster' && c.includeChildForces;
    const pool = this.scopePool(c.scope, ctx, deep) ?? [];
    return cmp(c.type, this.tally(pool, c.childId, c.field), c.value);
  }

  evalGroup(g: ConditionGroup, ctx: Ctx): boolean {
    const results = [...g.conditions.map((c) => this.evalCondition(c, ctx)), ...g.groups.map((x) => this.evalGroup(x, ctx))];
    if (results.length === 0) return true;
    return g.type === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  /** How many times a modifier applies (0 = not at all) */
  times(m: Modifier, ctx: Ctx): number {
    if (!this.evalGroup(m.when, ctx)) return 0;
    if (!m.repeats.length) return 1;
    let n = 0;
    for (const r of m.repeats) {
      const pool = this.scopePool(r.scope, ctx, r.includeChildSelections) ?? [];
      const v = this.tally(pool, r.childId, r.field);
      const k = r.value > 0 ? (r.roundUp ? Math.ceil(v / r.value) : Math.floor(v / r.value)) : 0;
      n += k * r.repeats;
    }
    return n;
  }

  private apply(cur: string, m: Modifier, times: number): string {
    let v = cur;
    for (let i = 0; i < times; i++) {
      switch (m.type) {
        case 'set': v = m.value; break;
        case 'increment': v = String(Number(v || 0) + Number(m.value)); break;
        case 'decrement': v = String(Number(v || 0) - Number(m.value)); break;
        case 'multiply': v = String(Number(v || 0) * Number(m.value)); break;
        case 'append': v = v && v !== '-' ? `${v}, ${m.value}` : m.value; break;
        case 'replace': if (m.arg != null && v.includes(m.arg)) v = v.split(m.arg).join(m.value); else if (m.arg == null) v = m.value; break;
      }
      if (m.type === 'set' || m.type === 'replace') break;
    }
    return v;
  }

  /** Modifiers that other selections direct at `si` (scope parent / root-entry / explicit ancestor) */
  private externalMods(si: SelInfo): { m: Modifier; ctx: Ctx }[] {
    const out: { m: Modifier; ctx: Ctx }[] = [];
    for (const d of this.descendants(si.sel, true)) {
      const dctx: Ctx = { self: d.sel, parent: d.parent, force: d.force, groupIds: d.groupIds };
      for (const m of d.eff.modifiers) {
        if (!m.scope || m.scope === 'self') continue;
        const direct = d.parent.kind === 'sel' && d.parent.sel.id === si.sel.id;
        if ((m.scope === 'parent' && direct) || (m.scope === 'root-entry' && d.root.id === si.sel.id) || si.eff.ids.includes(m.scope)) {
          out.push({ m, ctx: dctx });
        }
      }
    }
    return out;
  }

  private ownMods(eff: Eff, ctx: Ctx) {
    return eff.modifiers.filter((m) => !m.scope || m.scope === 'self' || (ctx.self == null && false)).map((m) => ({ m, ctx }));
  }

  /** Evaluate a scalar field of an entry/group through its modifiers */
  field(eff: Eff, field: string, base: string, ctx: Ctx, extra: { m: Modifier; ctx: Ctx }[] = []): string {
    let v = base;
    for (const { m, ctx: c } of [...this.ownMods(eff, ctx), ...extra]) {
      if (m.field !== field) continue;
      const t = this.times(m, c);
      if (t) v = this.apply(v, m, t);
    }
    return v;
  }

  isHidden(eff: Eff, ctx: Ctx): boolean {
    return this.field(eff, 'hidden', String(eff.hidden), ctx) === 'true';
  }

  constraintValue(eff: Eff, k: Constraint, ctx: Ctx): number {
    return Number(this.field(eff, k.id, String(k.value), ctx));
  }

  // ------------------------------------------------------------ selection views

  private ctxOf(si: SelInfo): Ctx {
    return { self: si.sel, parent: si.parent, force: si.force, groupIds: si.groupIds };
  }

  categoriesOf(si: SelInfo): string[] {
    const ctx = this.ctxOf(si);
    const cats = new Set(si.eff.categoryIds);
    for (const { m, ctx: c } of [...this.ownMods(si.eff, ctx), ...this.externalMods(si)]) {
      if (m.field !== 'category') continue;
      if (!this.times(m, c)) continue;
      if (m.type === 'add') cats.add(m.value);
      if (m.type === 'remove') cats.delete(m.value);
    }
    return [...cats];
  }

  ownCost(sel: Selection): Record<string, number> {
    const si = this.infos.get(sel.id);
    if (!si) return {};
    if (this.costGuard.has(sel.id)) return {};
    this.costGuard.add(sel.id);
    try {
      const ctx = this.ctxOf(si);
      const ext = this.externalMods(si);
      const out: Record<string, number> = {};
      const typeIds = new Set([...this.pack.costTypes.map((c) => c.id), ...Object.keys(si.eff.node.costs), ...Object.keys(si.eff.link?.costs ?? {})]);
      for (const t of typeIds) {
        const base = si.eff.link?.costs[t] ?? si.eff.node.costs[t] ?? 0;
        const v = Number(this.field(si.eff, t, String(base), ctx, ext));
        if (v) out[t] = v * sel.number;
      }
      return out;
    } finally {
      this.costGuard.delete(sel.id);
    }
  }

  totalCost(sel: Selection): Record<string, number> {
    const out = { ...this.ownCost(sel) };
    for (const c of sel.children) {
      const t = this.totalCost(c);
      for (const k in t) out[k] = (out[k] ?? 0) + t[k];
    }
    return out;
  }

  forceCost(force: Force): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of force.selections) {
      const t = this.totalCost(s);
      for (const k in t) out[k] = (out[k] ?? 0) + t[k];
    }
    return out;
  }

  rosterCost(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of this.roster.forces) {
      const t = this.forceCost(f);
      for (const k in t) out[k] = (out[k] ?? 0) + t[k];
    }
    return out;
  }

  private evalProfile(p: Profile, si: SelInfo, extra: { m: Modifier; ctx: Ctx }[]): EvaluatedProfile {
    const ctx = this.ctxOf(si);
    const mods = [
      ...p.modifiers.map((m) => ({ m, ctx })),
      ...si.eff.modifiers.filter((m) => !m.scope || m.scope === 'self').map((m) => ({ m, ctx })),
      ...extra,
    ];
    let name = p.name;
    const characteristics = p.characteristics.map((ch) => {
      let v = ch.value;
      for (const { m, ctx: c } of mods) {
        if (m.field !== ch.typeId) continue;
        if (m.affects && m.affects.startsWith('profiles.') && m.affects !== `profiles.${p.typeName}` && m.affects !== 'profiles') continue;
        const t = this.times(m, c);
        if (t) v = this.apply(v, m, t);
      }
      return { ...ch, value: v };
    });
    for (const { m, ctx: c } of p.modifiers.map((m) => ({ m, ctx }))) if (m.field === 'name' && this.times(m, c)) name = this.apply(name, m, 1);
    return { id: p.id, name, typeId: p.typeId, typeName: p.typeName, characteristics };
  }

  view(sel: Selection): SelView | undefined {
    const hit = this.viewCache.get(sel.id);
    if (hit) return hit;
    const si = this.infos.get(sel.id);
    if (!si) return undefined;
    const ctx = this.ctxOf(si);
    const ext = this.externalMods(si);
    const name = this.field(si.eff, 'name', si.eff.link?.name && si.eff.link.name !== si.eff.node.name ? si.eff.node.name : si.eff.node.name, ctx, ext);
    const hidden = this.field(si.eff, 'hidden', String(si.eff.hidden), ctx) === 'true';
    const info: string[] = [];
    for (const { m, ctx: c } of [...this.ownMods(si.eff, ctx)]) if (m.field === 'info' && m.type === 'add' && this.times(m, c)) info.push(m.value);

    const profiles: EvaluatedProfile[] = [];
    const rules: EvaluatedInfo[] = [];
    const abilities: EvaluatedInfo[] = [];
    const profMods = ext.filter(({ m }) => this.pack.profileTypes.some((pt) => pt.characteristics.some((c) => c.id === m.field)));
    for (const p of si.eff.profiles) if (!p.hidden) profiles.push(this.evalProfile(p, si, profMods));
    for (const r of si.eff.rules) if (!r.hidden) rules.push({ id: r.id, name: r.name, type: 'rule', description: r.description });
    for (const l of si.eff.infoLinks) {
      let lname = l.name;
      let annotation: string | undefined;
      let lhidden = l.hidden;
      for (const m of l.modifiers) {
        const t = this.times(m, ctx);
        if (!t) continue;
        if (m.field === 'annotation') annotation = this.apply(annotation ?? '', m, t);
        else if (m.field === 'name') lname = this.apply(lname, m, t);
        else if (m.field === 'hidden') lhidden = m.value === 'true';
      }
      if (lhidden) continue;
      if (l.type === 'rule') {
        const r = this.pack.sharedRules[l.targetId];
        rules.push({ id: l.id, name: lname || r?.name || '', type: 'rule', annotation, description: r?.description });
      } else if (l.type === 'profile') {
        const p = this.pack.sharedProfiles[l.targetId];
        if (!p) continue;
        const ep = this.evalProfile(p, si, profMods);
        const pt = p.typeName;
        if (pt === 'Ability' || pt === 'Abilities' || p.characteristics.length <= 1) {
          abilities.push({ id: l.id, name: lname || p.name, type: 'profile', annotation, description: ep.characteristics.map((c) => c.value).join(' '), profile: ep });
        } else profiles.push(ep);
      }
    }
    const costs = this.ownCost(sel);
    const v: SelView = {
      sel, name, hidden, costs, totalCosts: this.totalCost(sel), categories: this.categoriesOf(si),
      primaryCategory: si.eff.primaryCategory, profiles, rules, abilities, info, eff: si.eff,
      allProfiles: [...profiles], allRules: [...rules], allAbilities: [...abilities],
    };
    for (const c of sel.children) {
      const cv = this.view(c);
      if (!cv || cv.hidden) continue;
      const ct = cv.eff.node.entryType;
      if (ct === 'model' || ct === 'unit') continue;
      v.allProfiles.push(...cv.allProfiles);
      v.allRules.push(...cv.allRules);
      v.allAbilities.push(...cv.allAbilities);
    }
    const dedupe = <T extends { name: string; annotation?: string }>(xs: T[]) => {
      const m = new Map<string, T>();
      for (const x of xs) {
        const k = x.name.replace(/\s*\(.*\)$/, '');
        const prev = m.get(k);
        const a = Number(x.annotation), b = Number(prev?.annotation);
        if (prev && !isNaN(a) && !isNaN(b)) m.set(k, { ...prev, annotation: String(a + b) });
        else if (!prev) m.set(k, x);
      }
      return [...m.values()];
    };
    v.allRules = dedupe(v.allRules);
    v.allAbilities = dedupe(v.allAbilities);
    const seenP = new Set<string>();
    v.allProfiles = v.allProfiles.filter((p) => { const k = p.typeName + p.name + p.characteristics.map((c) => c.value).join(); if (seenP.has(k)) return false; seenP.add(k); return true; });
    this.viewCache.set(sel.id, v);
    return v;
  }

  // ------------------------------------------------------------ options

  /** Build the option tree under a selection (or at force root) */
  options(parent: Parent): OptionNode[] {
    const force = parent.kind === 'force' ? parent.force : this.infos.get(parent.sel.id)!.force;
    const ctxBase: Ctx = { parent, force };
    const siblings = parent.kind === 'force' ? parent.force.selections : parent.sel.children;
    const ids = parent.kind === 'force' ? this.rootIds(parent.force) : this.resolve(parent.sel.nodeId).node.children;
    const build = (idsIn: string[], path: string[]): OptionNode[] => {
      const out: OptionNode[] = [];
      for (const cid of idsIn) {
        if (!this.pack.nodes[cid]) continue;
        const eff = this.resolve(cid);
        const ctx: Ctx = { ...ctxBase, groupIds: path };
        const hidden = this.isHidden(eff, ctx);
        const { min, max } = this.limits(eff, ctx);
        if (eff.isGroup) {
          const children = build(eff.node.children, [...path, ...eff.ids]);
          const count = siblings.filter((s) => this.infos.get(s.id)?.groupIds.some((g) => eff.ids.includes(g))).reduce((a, s) => a + s.number, 0);
          out.push({ eff, id: cid, name: eff.node.name, hidden, isGroup: true, groupIds: path, min, max, count, cost: {}, children, selections: [], info: this.infoOf(eff, ctx) });
        } else {
          const sels = siblings.filter((s) => s.nodeId === cid);
          const count = sels.reduce((a, s) => a + s.number, 0);
          const cost: Record<string, number> = {};
          for (const t of this.pack.costTypes) {
            const base = eff.link?.costs[t.id] ?? eff.node.costs[t.id] ?? 0;
            const v = Number(this.field(eff, t.id, String(base), ctx));
            if (v) cost[t.id] = v;
          }
          out.push({ eff, id: cid, name: this.field(eff, 'name', eff.node.name, ctx), hidden, isGroup: false, groupIds: path, min, max, count, cost, children: [], selections: sels, info: this.infoOf(eff, ctx) });
        }
      }
      return out.sort((a, b) => (a.eff.node.sortIndex ?? 0) - (b.eff.node.sortIndex ?? 0));
    };
    return build(ids, []);
  }

  private infoOf(eff: Eff, ctx: Ctx): string[] {
    return eff.modifiers.filter((m) => m.field === 'info' && m.type === 'add' && this.times(m, ctx)).map((m) => m.value);
  }

  /** min/max per parent for an option (only constraints counting itself within its parent) */
  limits(eff: Eff, ctx: Ctx): { min?: number; max?: number } {
    let min: number | undefined;
    let max: number | undefined;
    for (const k of eff.constraints) {
      if (k.field !== 'selections' || k.childId) continue;
      if (k.scope !== 'parent' && k.scope !== 'self' && k.scope !== 'force' && k.scope !== 'roster') continue;
      const v = this.constraintValue(eff, k, ctx);
      if (k.type === 'min') min = Math.max(min ?? 0, v);
      else max = max == null ? v : Math.min(max, v);
    }
    return { min, max };
  }

  // ------------------------------------------------------------ mutations

  private findParentSel(selId: string | null): Parent | undefined {
    if (selId == null) return undefined;
    const i = this.infos.get(selId);
    return i ? { kind: 'sel', sel: i.sel } : undefined;
  }

  add(parent: Parent, nodeId: string, number = 1): Selection {
    const sel: Selection = { id: uid(), nodeId, number, children: [] };
    const list = parent.kind === 'force' ? parent.force.selections : parent.sel.children;
    list.push(sel);
    this.touch();
    this.applyDefaults({ kind: 'sel', sel });
    return sel;
  }

  /** Auto-select defaults (defaultAmount / group defaults) below a new selection */
  applyDefaults(parent: Parent, depth = 0) {
    if (depth > 12) return;
    const walk = (opts: OptionNode[]) => {
      for (const o of opts) {
        if (o.hidden) continue;
        if (o.isGroup) {
          if (o.eff.node.defaultSelectionEntryId && o.count === 0) {
            const target = o.children.find((c) => c.eff.ids.includes(o.eff.node.defaultSelectionEntryId!) || c.id === o.eff.node.defaultSelectionEntryId);
            if (target && !target.hidden) this.addRaw(parent, target.id, 1, depth);
          }
          walk(o.children);
          continue;
        }
        const ctx: Ctx = { parent, force: this.forceOf(parent), groupIds: o.groupIds };
        const d = Math.max(Number(this.field(o.eff, 'defaultAmount', String(o.eff.defaultAmount ?? 0), ctx)), o.min ?? 0);
        if (d > 0 && o.count === 0) {
          const oneEach = o.eff.node.entryType === 'model' || o.eff.node.entryType === 'unit';
          if (oneEach) for (let i = 0; i < d; i++) this.addRaw(parent, o.id, 1, depth);
          else this.addRaw(parent, o.id, d, depth);
        }
      }
    };
    walk(this.options(parent));
  }

  private forceOf(p: Parent): Force {
    return p.kind === 'force' ? p.force : this.infos.get(p.sel.id)!.force;
  }

  private addRaw(parent: Parent, nodeId: string, number: number, depth: number) {
    const sel: Selection = { id: uid(), nodeId, number, children: [] };
    (parent.kind === 'force' ? parent.force.selections : parent.sel.children).push(sel);
    this.touch();
    this.applyDefaults({ kind: 'sel', sel }, depth + 1);
  }

  remove(selId: string) {
    const i = this.infos.get(selId);
    if (!i) return;
    const list = i.parent.kind === 'force' ? i.parent.force.selections : i.parent.sel.children;
    const idx = list.findIndex((s) => s.id === selId);
    if (idx >= 0) list.splice(idx, 1);
    this.touch();
  }

  setNumber(selId: string, n: number) {
    const i = this.infos.get(selId);
    if (!i) return;
    if (n <= 0) return this.remove(selId);
    i.sel.number = n;
    this.touch();
  }

  duplicate(selId: string): Selection | undefined {
    const i = this.infos.get(selId);
    if (!i) return;
    const clone = (s: Selection): Selection => ({ ...s, id: uid(), children: s.children.map(clone) });
    const c = clone(i.sel);
    const list = i.parent.kind === 'force' ? i.parent.force.selections : i.parent.sel.children;
    list.splice(list.indexOf(i.sel) + 1, 0, c);
    this.touch();
    return c;
  }

  /** Toggle an option in a parent: add if absent, remove if present (for max-1 options) */
  toggle(parent: Parent, nodeId: string) {
    const list = parent.kind === 'force' ? parent.force.selections : parent.sel.children;
    const existing = list.find((s) => s.nodeId === nodeId);
    if (existing) this.remove(existing.id);
    else this.add(parent, nodeId);
  }

  touch() {
    this.roster.updatedAt = new Date().toISOString();
    this.reindex();
  }

  newForce(catalogueId: string, forceEntryId?: string): Force {
    const cat = this.pack.catalogues.find((c) => c.id === catalogueId);
    const fe = forceEntryId ?? cat?.forceEntries[0]?.id ?? this.pack.systemForceEntries[0]?.id ?? 'force';
    const force: Force = { id: uid(), forceEntryId: fe, catalogueId, selections: [] };
    this.roster.forces.push(force);
    this.touch();
    // root defaults, two passes so defaults that depend on earlier defaults (e.g. allegiance) resolve
    for (let pass = 0; pass < 2; pass++) this.applyDefaults({ kind: 'force', force });
    return force;
  }

  // ------------------------------------------------------------ validation

  errors(): RosterError[] {
    const out: RosterError[] = [];
    const seen = new Set<string>();
    const nameOf = (p: Parent) => (p.kind === 'force' ? this.forceEntry(p.force)?.name ?? 'Force' : this.view(p.sel)?.name ?? '');
    const check = (parent: Parent) => {
      const force = this.forceOf(parent);
      const walk = (opts: OptionNode[]) => {
        for (const o of opts) {
          const ctx: Ctx = { parent, force, groupIds: o.groupIds };
          const selected = o.isGroup ? o.count > 0 : o.selections.length > 0;
          if (o.hidden && selected) {
            out.push({ kind: 'hidden', selId: parent.kind === 'sel' ? parent.sel.id : undefined, forceId: force.id, message: `${nameOf(parent)}: ${o.name} cannot be selected while hidden` });
          }
          if (o.isGroup) walk(o.children);
          if (o.hidden && !selected) continue;
          for (const k of o.eff.constraints) {
            if (k.field !== 'selections') continue;
            const v = this.constraintValue(o.eff, k, ctx);
            let count: number;
            let label = o.name;
            if (k.childId) {
              // e.g. "max 0 of X within self"
              const pools = o.selections.map((s) => this.scopePool(k.scope, { self: s, parent, force }, k.includeChildSelections) ?? []);
              count = Math.max(0, ...pools.map((p) => this.tally(p, k.childId, 'selections')));
              if (!o.selections.length) continue;
              label = this.pack.nodes[k.childId]?.name ?? this.pack.categories[k.childId] ?? k.childId;
              const owner = o.name;
              if (k.type === 'max' && count > v) out.push({ kind: 'constraint', forceId: force.id, selId: o.selections[0]?.id, message: `${owner} has ${count - v} selections too many of ${label} (max ${v})` });
              if (k.type === 'min' && count < v) out.push({ kind: 'constraint', forceId: force.id, selId: o.selections[0]?.id, message: `${owner} requires ${v - count} selections more of ${label}` });
              continue;
            }
            if (k.scope === 'parent' || k.scope === 'self') count = o.count;
            else if (k.scope === 'force' || k.scope === 'roster') {
              const key = `${k.id}:${k.scope === 'force' ? force.id : 'roster'}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const pool = k.scope === 'force' ? this.forceSelections(force, true) : this.roster.forces.flatMap((f) => this.forceSelections(f, true));
              count = pool.filter((si) => o.eff.ids.some((id) => si.eff.ids.includes(id) || si.groupIds.includes(id))).reduce((a, si) => a + si.sel.number, 0);
            } else continue;
            if (k.type === 'max' && count > v) {
              out.push({ kind: 'constraint', forceId: force.id, selId: parent.kind === 'sel' ? parent.sel.id : undefined, message: `${k.scope === 'roster' ? 'Roster' : nameOf(parent)} has ${count - v} selections too many of ${label} (max ${v})` });
            }
            if (k.type === 'min' && count < v) {
              out.push({ kind: 'constraint', forceId: force.id, selId: parent.kind === 'sel' ? parent.sel.id : undefined, message: `${nameOf(parent)} requires ${v - count} selections more of ${label}` });
            }
          }
        }
      };
      walk(this.options(parent));
    };
    for (const force of this.roster.forces) {
      check({ kind: 'force', force });
      for (const si of this.forceSelections(force, true)) check({ kind: 'sel', sel: si.sel });
      // category limits on the force
      const fe = this.forceEntry(force);
      for (const cl of fe?.categoryLinks ?? []) {
        for (const k of cl.constraints) {
          const count = force.selections.filter((s) => { const i = this.infos.get(s.id); return i && this.categoriesOf(i).includes(cl.targetId); }).reduce((a, s) => a + s.number, 0);
          const name = this.pack.categories[cl.targetId] ?? 'Category';
          if (k.type === 'max' && count > k.value) out.push({ kind: 'category', forceId: force.id, message: `${name}: ${count} of max ${k.value}` });
          if (k.type === 'min' && count < k.value) out.push({ kind: 'category', forceId: force.id, message: `${name}: needs at least ${k.value}` });
        }
      }
    }
    const totals = this.rosterCost();
    for (const t of this.pack.costTypes) {
      const lim = this.roster.costLimits[t.id];
      if (lim != null && lim >= 0 && (totals[t.id] ?? 0) > lim) out.push({ kind: 'cost', message: `${t.name}: ${totals[t.id]} of ${lim}` });
    }
    return out;
  }

  /** Count of root selections per category in a force (for category headers) */
  categoryCounts(force: Force): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of force.selections) {
      const i = this.infos.get(s.id);
      if (!i) continue;
      const cat = i.eff.primaryCategory ?? 'uncategorised';
      out[cat] = (out[cat] ?? 0) + s.number;
    }
    return out;
  }
}

export function newRoster(pack: GamePack, name: string): Roster {
  const now = new Date().toISOString();
  const costLimits: Record<string, number> = {};
  for (const t of pack.costTypes) if (t.defaultLimit > 0) costLimits[t.id] = t.defaultLimit;
  return { id: uid(), name, packId: pack.id, costLimits, forces: [], createdAt: now, updatedAt: now };
}
