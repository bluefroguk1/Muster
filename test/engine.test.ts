import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { compilePack } from '../src/engine/compile';
import { RosterEngine, newRoster } from '../src/engine/roster';
import type { Selection } from '../src/engine/types';

const dir = 'test/fixtures/bb';
const pack = compilePack(readdirSync(dir).map((f) => ({ name: f, xml: readFileSync(`${dir}/${f}`, 'utf8') })));
const PENNY = pack.costTypes.find((c) => c.name === 'Penny')!.id;
const cat = (n: string) => pack.catalogues.find((c) => c.name.startsWith(n))!;

function band(name: string) {
  const r = newRoster(pack, 'test');
  const e = new RosterEngine(pack, r);
  const force = e.newForce(cat(name).id);
  return { e, r, force };
}
const rootOpt = (e: RosterEngine, force: any, name: string) => {
  const flat = (o: any[]): any[] => o.flatMap((x) => (x.isGroup ? flat(x.children) : [x]));
  return flat(e.options({ kind: 'force', force })).find((o) => o.name === name)!;
};
const findOpt = (e: RosterEngine, sel: Selection, name: string) => {
  const flat = (o: any[]): any[] => o.flatMap((x) => [x, ...flat(x.children)]);
  return flat(e.options({ kind: 'sel', sel })).find((o) => o.name === name)!;
};
const stat = (e: RosterEngine, sel: Selection, stat: string) =>
  e.view(sel)!.profiles.find((p) => p.typeName === 'Unit')!.characteristics.find((c) => c.name === stat)!.value;

describe('compile', () => {
  it('reads system and catalogues', () => {
    expect(pack.name).toContain('Burrows');
    expect(pack.catalogues.length).toBe(11);
    expect(Object.keys(pack.nodes).length).toBeGreaterThan(1000);
  });
});

describe('Burrows & Badgers rules', () => {
  it('Freebeasts: allegiance -25 and Study auto-added', () => {
    const { e, force } = band('Freebeasts');
    const names = force.selections.map((s) => e.view(s)!.name);
    expect(names).toContain('Allegiance: Freebeast');
    expect(names).toContain('Study');
    expect(e.rosterCost()[PENNY]).toBe(-25);
  });
  it('Hedgehog presence d8, cost 31', () => {
    const { e, force } = band('Freebeasts');
    const h = e.add({ kind: 'force', force }, rootOpt(e, force, 'Hedgehog').id);
    expect(stat(e, h, 'Presence')).toBe('d8');
    expect(e.totalCost(h)[PENNY]).toBe(31);
    expect(e.rosterCost()[PENNY]).toBe(6);
  });
  it('Royalists: magic archetypes', () => {
    const { e, force } = band('Royalists');
    const hare = e.add({ kind: 'force', force }, rootOpt(e, force, 'Hare').id);
    const mu = findOpt(e, hare, 'Magic User');
    const muSel = e.add({ kind: 'sel', sel: hare }, mu.id);
    const arche = findOpt(e, muSel, 'Magical Archetypes');
    const visible = arche.children.filter((c: any) => !c.hidden).map((c: any) => c.name).sort();
    expect(visible).toEqual(['Divine', 'Elementalism', 'Light', 'Natural', 'Noble', 'Unbound']);
  });
  it('Undead: Stable Ghast upgrade', () => {
    const { e, force } = band('Undead');
    const b = e.add({ kind: 'force', force }, rootOpt(e, force, 'Badger').id);
    const sg = findOpt(e, b, 'Stable Ghast');
    const sgSel = e.add({ kind: 'sel', sel: b }, sg.children.find((c: any) => c.name === 'Stable Ghast').id);
    expect(sgSel).toBeTruthy();
    expect(e.totalCost(b)[PENNY]).toBe(82);
    expect(stat(e, b, 'Level')).toBe('6');
    const rules = e.view(b)!.allRules.map((r) => r.name);
    expect(rules).toContain('Uncanny');
    expect(rules).toContain('Otherworldly');
    expect(e.errors().some((x) => x.message.includes('Skill'))).toBe(true);
  });
  it('Mist Ghasts hidden outside Undead', () => {
    const { e, force } = band('Royalists');
    expect(rootOpt(e, force, 'Mist Ghast (Large)').hidden).toBe(true);
  });
  it('Kindred: Mastersmithed cost 12 and no error after setup', () => {
    const { e, force } = band('Kindred');
    const fox = e.add({ kind: 'force', force }, rootOpt(e, force, 'Fox').id);
    const w = e.add({ kind: 'sel', sel: fox }, findOpt(e, fox, 'One-handed weapon').id);
    const ms = findOpt(e, w, 'Mastersmithed');
    e.add({ kind: 'sel', sel: w }, (ms.isGroup ? ms.children[0] : ms).id);
    expect(e.totalCost(w)[PENNY]).toBe(20);
    const setup = fox.children.find((c) => e.view(c)!.name.startsWith('Setup Only'))!;
    e.remove(setup.id);
    expect(e.errors().filter((x) => x.kind === 'hidden')).toEqual([]);
  });
  it('Wildlings: 9 Large models is an error', () => {
    const { e, force } = band('Wildlings');
    const id = rootOpt(e, force, 'Hare').id;
    for (let i = 0; i < 9; i++) e.add({ kind: 'force', force }, id);
    expect(e.errors().some((x) => x.kind === 'category')).toBe(true);
  });
  it('Witch Hunters: Armoured by Faith adds Level', () => {
    const { e, force } = band('Witch Hunters');
    const g = e.add({ kind: 'force', force }, rootOpt(e, force, 'Attack Grub').id);
    expect(e.totalCost(g)[PENNY]).toBe(26);
    const abf = findOpt(e, g, 'Armoured by Faith');
    e.add({ kind: 'sel', sel: g }, abf.children[0].id);
    expect(stat(e, g, 'Level')).toBe('2');
    expect(stat(e, g, 'Fortitude')).toBe('d8');
  });
});
