// Game-specific presentation hints (labels, stat help, sheet layout). Falls back to generic behaviour.
import type { GamePack } from '../engine/types';

export interface StatHint { short: string; help: string }
export interface GameHints {
  stats: Record<string, StatHint>;
  /** Wound track: number of boxes, shaded boxes and what shading means */
  wounds?: { boxes: number; shaded: number[]; help: string };
  /** Equipment slots in sheet order: label + group-name pattern + capacity */
  slots?: { label: string; match: RegExp; count: number }[];
  fateHelp?: string;
  xpHelp?: string;
  levelHelp?: string;
}

const BURROWS: GameHints = {
  stats: {
    Movement: { short: 'M', help: 'How far in inches the model can move horizontally.' },
    Strike: { short: 'S', help: 'Used when fighting an opponent in melee.' },
    Block: { short: 'B', help: 'Used to defend against enemy attacks.' },
    Ranged: { short: 'R', help: 'How well the model shoots with missile weapons.' },
    Nimbleness: { short: 'N', help: 'Avoiding missile attacks, and vertical movement (climbing, jumping).' },
    Concealment: { short: 'C', help: 'Avoiding being noticed – sneaking and hiding.' },
    Awareness: { short: 'A', help: 'Searching for hidden items and spotting sneaking enemies.' },
    Fortitude: { short: 'F', help: 'Willpower, courage and determination. Also used to cast Fortitude-based spells.' },
    Presence: { short: 'P', help: 'Influence on the world around them – intimidation or a strong personal aura. Used for Presence-based spells.' },
    Level: { short: 'Lvl', help: 'Small start at 1, Medium 2, Large 3, Massive 4. +1 per Experience Advance; the band’s Rating is the total of all Levels.' },
  },
  wounds: {
    boxes: 16,
    shaded: [4, 7, 10, 13],
    help: 'Mark Wounds from box 1. Each shaded box crossed off (4, 7, 10, 13) gives −1 to all Roll-offs. Past 16 the model goes Out of Action.',
  },
  slots: [
    { label: 'Weapon', match: /^weapon/i, count: 2 },
    { label: 'Armour', match: /^armou?r/i, count: 2 },
    { label: 'Item', match: /^item|poison|ingredient|special ammunition|bonded/i, count: 1 },
    { label: 'Special', match: /^special slot/i, count: 1 },
  ],
  fateHelp: 'Fate points let a model re-roll or use Skills that cost Fate. Leaders start with 3.',
  xpHelp: 'Experience points earned in battle; enough XP gives an Experience Advance.',
  levelHelp: 'Model Level. The band’s Rating is the sum of all Levels.',
};

const GENERIC: GameHints = { stats: {} };

export function hintsFor(pack: GamePack): GameHints {
  return /burrows/i.test(pack.name) ? BURROWS : GENERIC;
}

export function statShort(h: GameHints, name: string) {
  return h.stats[name]?.short ?? (name.length <= 4 ? name : name.slice(0, 3));
}
