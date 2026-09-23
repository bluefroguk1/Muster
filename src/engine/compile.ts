// Compile BattleScribe / New Recruit XML (.gst + .cat) into a Muster GamePack.
import type {
  Catalogue, CategoryLink, Condition, ConditionGroup, Constraint, CostType, ForceEntry, GamePack,
  InfoLink, Modifier, Node, Profile, ProfileType, Repeat, Rule,
} from './types';

type El = Element;

const kids = (el: El | null | undefined, name?: string): El[] =>
  el ? Array.from(el.children).filter((c) => !name || c.localName === name) : [];
const kid = (el: El | null | undefined, name: string): El | undefined => kids(el, name)[0];
const grand = (el: El, wrapper: string, name: string): El[] => kids(kid(el, wrapper), name);
const bool = (v: string | null, d = false) => (v == null ? d : v === 'true');
const num = (v: string | null, d = 0) => (v == null || v === '' ? d : Number(v));
const text = (el?: El) => (el?.textContent ?? '').trim();

export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('Invalid XML: ' + (err.textContent ?? '').slice(0, 200));
  return doc;
}

function condition(el: El): Condition {
  return {
    type: el.getAttribute('type') ?? 'atLeast',
    value: num(el.getAttribute('value')),
    field: el.getAttribute('field') ?? 'selections',
    scope: el.getAttribute('scope') ?? 'parent',
    childId: el.getAttribute('childId') ?? undefined,
    includeChildSelections: bool(el.getAttribute('includeChildSelections')),
    includeChildForces: bool(el.getAttribute('includeChildForces')),
    percentValue: bool(el.getAttribute('percentValue')),
  };
}

function conditionGroup(el: El, type: 'and' | 'or'): ConditionGroup {
  return {
    type,
    conditions: grand(el, 'conditions', 'condition').map(condition),
    groups: grand(el, 'conditionGroups', 'conditionGroup').map((g) =>
      conditionGroup(g, (g.getAttribute('type') as 'and' | 'or') ?? 'and'),
    ),
  };
}

function repeat(el: El): Repeat {
  return {
    value: num(el.getAttribute('value'), 1),
    repeats: num(el.getAttribute('repeats'), 1),
    field: el.getAttribute('field') ?? 'selections',
    scope: el.getAttribute('scope') ?? 'parent',
    childId: el.getAttribute('childId') ?? undefined,
    includeChildSelections: bool(el.getAttribute('includeChildSelections')),
    includeChildForces: bool(el.getAttribute('includeChildForces')),
    roundUp: bool(el.getAttribute('roundUp')),
  };
}

function modifiers(el: El): Modifier[] {
  const out: Modifier[] = [];
  for (const m of grand(el, 'modifiers', 'modifier')) {
    out.push({
      type: m.getAttribute('type') ?? 'set',
      field: m.getAttribute('field') ?? '',
      value: m.getAttribute('value') ?? '',
      arg: m.getAttribute('arg') ?? undefined,
      scope: m.getAttribute('scope') ?? undefined,
      affects: m.getAttribute('affects') ?? undefined,
      when: conditionGroup(m, 'and'),
      repeats: grand(m, 'repeats', 'repeat').map(repeat),
    });
  }
  // modifierGroups: flatten, AND-ing the group's conditions into each child
  for (const g of grand(el, 'modifierGroups', 'modifierGroup')) {
    const gc = conditionGroup(g, 'and');
    for (const m of modifiers(g)) {
      out.push({ ...m, when: { type: 'and', conditions: [], groups: [gc, m.when] } });
    }
  }
  return out;
}

function constraints(el: El): Constraint[] {
  return grand(el, 'constraints', 'constraint').map((c) => ({
    id: c.getAttribute('id') ?? '',
    type: (c.getAttribute('type') as 'min' | 'max') ?? 'max',
    value: num(c.getAttribute('value')),
    field: c.getAttribute('field') ?? 'selections',
    scope: c.getAttribute('scope') ?? 'parent',
    childId: c.getAttribute('childId') ?? undefined,
    shared: bool(c.getAttribute('shared'), true),
    includeChildSelections: bool(c.getAttribute('includeChildSelections')),
    includeChildForces: bool(c.getAttribute('includeChildForces')),
  }));
}

function costs(el: El): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of grand(el, 'costs', 'cost')) out[c.getAttribute('typeId') ?? c.getAttribute('name') ?? ''] = num(c.getAttribute('value'));
  return out;
}

function profile(el: El): Profile {
  return {
    id: el.getAttribute('id') ?? '',
    name: el.getAttribute('name') ?? '',
    typeId: el.getAttribute('typeId') ?? '',
    typeName: el.getAttribute('typeName') ?? '',
    hidden: bool(el.getAttribute('hidden')),
    characteristics: grand(el, 'characteristics', 'characteristic').map((c) => ({
      typeId: c.getAttribute('typeId') ?? '',
      name: c.getAttribute('name') ?? '',
      value: text(c),
    })),
    modifiers: modifiers(el),
  };
}

function rule(el: El): Rule {
  return {
    id: el.getAttribute('id') ?? '',
    name: el.getAttribute('name') ?? '',
    description: text(kid(el, 'description')),
    hidden: bool(el.getAttribute('hidden')),
    modifiers: modifiers(el),
  };
}

function infoLinks(el: El): InfoLink[] {
  return grand(el, 'infoLinks', 'infoLink').map((l) => ({
    id: l.getAttribute('id') ?? '',
    targetId: l.getAttribute('targetId') ?? '',
    type: (l.getAttribute('type') as InfoLink['type']) ?? 'rule',
    name: l.getAttribute('name') ?? '',
    hidden: bool(l.getAttribute('hidden')),
    modifiers: modifiers(l),
  }));
}

function categoryLinks(el: El): CategoryLink[] {
  return grand(el, 'categoryLinks', 'categoryLink').map((l) => ({
    id: l.getAttribute('id') ?? '',
    targetId: l.getAttribute('targetId') ?? '',
    primary: bool(l.getAttribute('primary')),
    constraints: constraints(l),
    modifiers: modifiers(l),
  }));
}

class Compiler {
  nodes: Record<string, Node> = {};
  sharedProfiles: Record<string, Profile> = {};
  sharedRules: Record<string, Rule> = {};
  categories: Record<string, string> = {};

  node(el: El, catalogueId: string): string {
    const tag = el.localName;
    const id = el.getAttribute('id') ?? `anon-${Object.keys(this.nodes).length}`;
    const kind = tag === 'entryLink' ? 'link' : tag === 'selectionEntryGroup' ? 'group' : 'entry';
    const n: Node = {
      id,
      kind,
      name: el.getAttribute('name') ?? '',
      entryType: kind === 'link' ? (el.getAttribute('type') ?? undefined) : el.getAttribute('type') ?? undefined,
      targetId: el.getAttribute('targetId') ?? undefined,
      hidden: bool(el.getAttribute('hidden')),
      collective: bool(el.getAttribute('collective')),
      flatten: bool(el.getAttribute('flatten')),
      defaultAmount: el.hasAttribute('defaultAmount') ? num(el.getAttribute('defaultAmount')) : undefined,
      defaultSelectionEntryId: el.getAttribute('defaultSelectionEntryId') ?? undefined,
      sortIndex: el.hasAttribute('sortIndex') ? num(el.getAttribute('sortIndex')) : undefined,
      costs: costs(el),
      constraints: constraints(el),
      modifiers: modifiers(el),
      profiles: grand(el, 'profiles', 'profile').map(profile),
      rules: grand(el, 'rules', 'rule').map(rule),
      infoLinks: infoLinks(el),
      categoryLinks: categoryLinks(el),
      children: [],
      comment: text(kid(el, 'comment')) || undefined,
      catalogueId,
    };
    // register inline profiles/rules so infoLinks can target them too
    for (const p of n.profiles) this.sharedProfiles[p.id] ??= p;
    for (const r of n.rules) this.sharedRules[r.id] ??= r;
    n.children = [
      ...grand(el, 'selectionEntries', 'selectionEntry'),
      ...grand(el, 'selectionEntryGroups', 'selectionEntryGroup'),
      ...grand(el, 'entryLinks', 'entryLink'),
    ].map((c) => this.node(c, catalogueId));
    if (this.nodes[id] && this.nodes[id].catalogueId !== catalogueId) {
      // id clash across files: keep the first, namespace the new one
      const nid = `${catalogueId}:${id}`;
      n.id = nid;
      this.nodes[nid] = n;
      return nid;
    }
    this.nodes[id] = n;
    return id;
  }

  shared(root: El, catalogueId: string) {
    for (const e of grand(root, 'sharedSelectionEntries', 'selectionEntry')) this.node(e, catalogueId);
    for (const e of grand(root, 'sharedSelectionEntryGroups', 'selectionEntryGroup')) this.node(e, catalogueId);
    for (const p of grand(root, 'sharedProfiles', 'profile')) this.sharedProfiles[p.getAttribute('id') ?? ''] = profile(p);
    for (const r of grand(root, 'sharedRules', 'rule')) this.sharedRules[r.getAttribute('id') ?? ''] = rule(r);
    for (const r of grand(root, 'rules', 'rule')) this.sharedRules[r.getAttribute('id') ?? ''] = rule(r);
    for (const c of grand(root, 'categoryEntries', 'categoryEntry')) this.categories[c.getAttribute('id') ?? ''] = c.getAttribute('name') ?? '';
  }

  forceEntries(root: El): ForceEntry[] {
    const out: ForceEntry[] = [];
    const walk = (el: El) => {
      for (const f of grand(el, 'forceEntries', 'forceEntry')) {
        out.push({
          id: f.getAttribute('id') ?? '',
          name: f.getAttribute('name') ?? '',
          hidden: bool(f.getAttribute('hidden')),
          categoryLinks: categoryLinks(f),
          constraints: constraints(f),
          modifiers: modifiers(f),
          costs: costs(f),
        });
        walk(f);
      }
    };
    walk(root);
    return out;
  }

  roots(root: El, catalogueId: string): string[] {
    return [
      ...grand(root, 'selectionEntries', 'selectionEntry'),
      ...grand(root, 'entryLinks', 'entryLink'),
    ].map((e) => this.node(e, catalogueId));
  }
}

export interface SourceFile { name: string; xml: string }

export function compilePack(files: SourceFile[], source?: GamePack['source']): GamePack {
  const docs = files
    .filter((f) => /\.(gst|cat)$/i.test(f.name) || f.xml.includes('<gameSystem') || f.xml.includes('<catalogue'))
    .map((f) => ({ name: f.name, root: parseXml(f.xml).documentElement }));
  const gst = docs.find((d) => d.root.localName === 'gameSystem');
  if (!gst) throw new Error('No game system (.gst) file found');
  const c = new Compiler();
  const sys = gst.root;
  const sysId = sys.getAttribute('id') ?? 'system';

  const costTypes: CostType[] = grand(sys, 'costTypes', 'costType').map((t) => ({
    id: t.getAttribute('id') ?? '',
    name: t.getAttribute('name') ?? '',
    defaultLimit: num(t.getAttribute('defaultCostLimit'), -1),
    hidden: bool(t.getAttribute('hidden')),
  }));
  const profileTypes: ProfileType[] = grand(sys, 'profileTypes', 'profileType').map((t) => ({
    id: t.getAttribute('id') ?? '',
    name: t.getAttribute('name') ?? '',
    characteristics: grand(t, 'characteristicTypes', 'characteristicType').map((ct) => ({
      id: ct.getAttribute('id') ?? '',
      name: ct.getAttribute('name') ?? '',
    })),
  }));

  c.shared(sys, sysId);
  const systemRootIds = c.roots(sys, sysId);
  const systemForceEntries = c.forceEntries(sys);

  const catalogues: Catalogue[] = docs
    .filter((d) => d.root.localName === 'catalogue')
    .map((d) => {
      const r = d.root;
      const id = r.getAttribute('id') ?? d.name;
      c.shared(r, id);
      return {
        id,
        name: r.getAttribute('name') ?? d.name,
        revision: num(r.getAttribute('revision')),
        library: bool(r.getAttribute('library')),
        rootIds: c.roots(r, id),
        forceEntries: c.forceEntries(r),
        imports: grand(r, 'catalogueLinks', 'catalogueLink')
          .filter((l) => bool(l.getAttribute('importRootEntries')))
          .map((l) => l.getAttribute('targetId') ?? ''),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    format: 'muster-pack',
    formatVersion: 1,
    id: sysId,
    name: sys.getAttribute('name') ?? 'Game',
    revision: num(sys.getAttribute('revision')),
    source,
    costTypes,
    profileTypes,
    categories: c.categories,
    catalogues,
    systemRootIds,
    systemForceEntries,
    nodes: c.nodes,
    sharedProfiles: c.sharedProfiles,
    sharedRules: c.sharedRules,
  };
}
