import type { RosterEngine } from '../engine/roster';
import type { Selection } from '../engine/types';

// Name generator for band members, in keeping with the Burrows & Badgers setting:
// a folkloric, 17th-century English countryside with Scottish-flavoured Hillfolk
// and a grim streak for the Undead. Names mix old English given names, hedgerow
// and woodland words, and species-flavoured family names.

const given = {
  common: [
    'Ambrose', 'Barnaby', 'Bartholomew', 'Cuthbert', 'Crispin', 'Edmund', 'Ezekiel', 'Gideon', 'Godwin', 'Humphrey',
    'Jasper', 'Jeb', 'Hob', 'Kit', 'Ned', 'Obadiah', 'Oswin', 'Percival', 'Piers', 'Septimus', 'Silas', 'Tobias',
    'Wat', 'Walter', 'Aldous', 'Fenwick', 'Tam', 'Rufus', 'Josiah', 'Lemuel', 'Mungo', 'Nathaniel', 'Roderick',
    'Agnes', 'Alys', 'Beatrix', 'Constance', 'Dorcas', 'Elsbeth', 'Hester', 'Joan', 'Lettice', 'Mabel', 'Maud',
    'Mercy', 'Prudence', 'Rosalind', 'Tamsin', 'Temperance', 'Winifred', 'Griselda', 'Isolde', 'Kezia', 'Martha',
  ],
  nature: ['Bramble', 'Hazel', 'Nettle', 'Thistle', 'Clover', 'Fennel', 'Sorrel', 'Rowan', 'Tansy', 'Burdock', 'Teasel', 'Yarrow', 'Sloe', 'Briar', 'Hawthorn', 'Rue'],
  hill: ['Hamish', 'Fergus', 'Angus', 'Ewan', 'Rab', 'Callum', 'Dougal', 'Murdo', 'Morag', 'Isla', 'Kirsty', 'Ailsa', 'Elspeth', 'Mhairi', 'Seonag', 'Torquil'],
  grim: ['Mortimer', 'Morwen', 'Ossian', 'Grimwald', 'Silence', 'Lament', 'Ashen', 'Wither', 'Hollow', 'Cinder', 'Dolor', 'Barrow'],
};

const family = {
  common: [
    'Ashburrow', 'Thistledown', 'Hollowmere', 'Fernsby', 'Oakhollow', 'Brackenridge', 'Mossbank', 'Nettlecombe', 'Hazelwick',
    'Wickerby', 'Tanglefoot', 'Barleycorn', 'Pennywhistle', 'Quillsworth', 'Mudlark', 'Hedgecroft', 'Dimbleby', 'Farthing',
    'Pickering', 'Rushmoor', 'Sedgewick', 'Whitlow', 'Cobbleby', 'Marchbank', 'Underhill', 'Applegarth', 'Tuttle', 'Grubb',
  ],
  hill: ['MacBracken', 'MacHeather', 'Drummond', 'Glenmuir', 'Craigie', 'MacRory', 'Kinloch', 'Strathie', 'MacTavish', 'Lochrie'],
  grim: ['Gravesend', 'Barrowmere', 'Mournwood', 'Ashgrave', 'Hollowbone', 'Marrowby', 'Blackthorn', 'Cairnsworth'],
};

/** species-flavoured family names (matched against the species name) */
const speciesFamily: [RegExp, string[]][] = [
  [/badger/i, ['Greybrock', 'Settwright', 'Brockhurst', 'Stripeback', 'Earthfast']],
  [/fox|fennec/i, ['Russet', 'Redbrush', 'Tod', 'Vulpicott', 'Emberly']],
  [/hedgehog/i, ['Prickleback', 'Quill', 'Urchinson', 'Spinney', 'Tiggs']],
  [/mole/i, ['Delver', 'Earthwright', 'Mouldwarp', 'Tunnock', 'Deepdig']],
  [/rat/i, ['Gnawbone', 'Sewell', 'Scurrey', 'Longtail', 'Wharfside']],
  [/mouse|dormouse/i, ['Wainscot', 'Crumbly', 'Hayloft', 'Nibbs', 'Pantry']],
  [/shrew/i, ['Needlesnout', 'Wickett', 'Skitter', 'Pipsqueak']],
  [/vole/i, ['Rillbank', 'Reedsby', 'Waterman', 'Sedge']],
  [/otter/i, ['Rillwater', 'Brookes', 'Riverwell', 'Slipstream', 'Holtby']],
  [/beaver/i, ['Dambuilder', 'Timberlake', 'Lodgeworth', 'Gnawpost']],
  [/squirrel/i, ['Nutkin', 'Treetop', 'Dreyworth', 'Acornsby', 'Bushytail']],
  [/hare/i, ['Longstride', 'Mapleleap', 'Moonrun', 'Harefield', 'Swiftfoot']],
  [/rabbit/i, ['Warren', 'Burrowes', 'Cottontuft', 'Dandelion', 'Thumper']],
  [/cat|wildcat|siamese/i, ['Whiskerby', 'Mouser', 'Purrington', 'Tabbard', 'Softpaw']],
  [/ferret|polecat|weasel|stoat/i, ['Slinkwell', 'Ermine', 'Mustel', 'Quickfang', 'Coneyguard']],
  [/hound|dog/i, ['Barkwell', 'Loyall', 'Kennelby', 'Scentwood', 'Houndsditch']],
  [/bird|raptor|owl/i, ['Featherstone', 'Windhover', 'Talonsby', 'Skylark', 'Rookery']],
  [/bat/i, ['Duskwing', 'Belfry', 'Nightveil', 'Echoes']],
  [/frog|toad|newt/i, ['Pondsworth', 'Croaker', 'Marshall', 'Lillypad', 'Bogwort']],
  [/lizard|adder|snake/i, ['Sunstone', 'Scaleby', 'Heathcote', 'Slither']],
  [/tortoise/i, ['Shellbourne', 'Slowcombe', 'Oldacre']],
  [/marmot/i, ['Highcrag', 'Whistler', 'Scree']],
  [/raccoon/i, ['Ringtail', 'Masquerade', 'Rummage']],
  [/armadillo/i, ['Platewell', 'Rollbuckle']],
  [/platypus/i, ['Duckbill', 'Rivet', 'Paddlesworth']],
];

const epithets = ['the Bold', 'the Quiet', 'Two-Toes', 'the Younger', 'the Elder', 'Half-Ear', 'the Lucky', 'Bramble-Beard', 'of the Hollow', 'the Unready', 'Longwhisker', 'the Wise'];

/** creatures that get one-word monikers rather than proper names */
const monikers: [RegExp, string[]][] = [
  [/grub/i, ['Squirm', 'Wriggles', 'Chewbark', 'Old Pale', 'Nibbler', 'Gristle', 'Maggoty Meg', 'Softbelly']],
  [/ghast/i, ['Wisp', 'The Moaning', 'Grey Whisper', 'Mistwalker', 'Old Sorrow', 'Hollow Jack', 'Pale Nell', 'Chill']],
];

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];

export interface NameOpts { faction?: string; taken?: Iterable<string>; random?: () => number }

/** A setting-appropriate name for a creature of the given species */
export function creatureName(species: string, opts: NameOpts = {}): string {
  const r = opts.random ?? Math.random;
  const taken = new Set(opts.taken ?? []);
  const faction = opts.faction ?? '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const mon = monikers.find(([re]) => re.test(species));
    let name: string;
    if (mon) name = pick(mon[1], r);
    else {
      const hill = /hillfolk/i.test(faction), grim = /undead/i.test(faction);
      const first = pick(hill ? (r() < 0.75 ? given.hill : given.common) : grim ? (r() < 0.6 ? given.grim : given.common) : r() < 0.28 ? given.nature : given.common, r);
      const sp = speciesFamily.find(([re]) => re.test(species))?.[1];
      const last = hill && r() < 0.7 ? pick(family.hill, r) : grim && r() < 0.6 ? pick(family.grim, r) : sp && r() < 0.5 ? pick(sp, r) : pick(family.common, r);
      name = r() < 0.08 ? `${first} ${pick(epithets, r)}` : `${first} ${last}`;
    }
    if (!taken.has(name)) return name;
  }
  return `${pick(given.common, r)} ${pick(family.common, r)}`;
}

/** Tidy species label: "Mouse/ Dormouse" → "Mouse", "Bird (Large)" → "Bird" */
export function speciesLabel(name: string) {
  return name.replace(/\s*\(.*?\)/g, '').split('/')[0].trim();
}

/** A fresh, unused name for a band member */
export function nameFor(e: RosterEngine, sel: Selection) {
  const node = e.info(sel.id)?.eff.node;
  const force = e.roster.forces[0];
  const faction = e.pack.catalogues.find((c) => c.id === force?.catalogueId)?.name;
  const taken = e.roster.forces.flatMap((f) => f.selections.map((s) => s.customName ?? ''));
  return creatureName(node?.name ?? '', { faction, taken });
}
