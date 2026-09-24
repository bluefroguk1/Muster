// Muster game-pack model: BattleScribe .gst/.cat data compiled to plain JSON.

export type Scope = string; // self | parent | root-entry | force | roster | ancestor | primary-catalogue | <entry id>

export interface Condition {
  type: string; // atLeast | atMost | greaterThan | lessThan | equalTo | notEqualTo | instanceOf | notInstanceOf
  value: number;
  field: string; // selections | forces | <costTypeId>
  scope: Scope;
  childId?: string;
  includeChildSelections: boolean;
  includeChildForces: boolean;
  percentValue?: boolean;
}

export interface ConditionGroup {
  type: 'and' | 'or';
  conditions: Condition[];
  groups: ConditionGroup[];
}

export interface Repeat {
  value: number;
  repeats: number;
  field: string;
  scope: Scope;
  childId?: string;
  includeChildSelections: boolean;
  includeChildForces: boolean;
  roundUp: boolean;
}

export interface Modifier {
  type: string; // set | increment | decrement | append | replace | add | remove | multiply
  field: string; // hidden | name | defaultAmount | annotation | category | info | <costTypeId> | <constraintId> | <characteristicTypeId>
  value: string;
  arg?: string;
  scope?: Scope; // target of the modifier (default: the entry that owns it)
  affects?: string; // e.g. profiles.Unit
  when: ConditionGroup; // implicit AND root
  repeats: Repeat[];
}

export interface Constraint {
  id: string;
  type: 'min' | 'max';
  value: number;
  field: string;
  scope: Scope;
  childId?: string;
  shared: boolean;
  includeChildSelections: boolean;
  includeChildForces: boolean;
}

export interface Characteristic { typeId: string; name: string; value: string }

export interface Profile {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  hidden: boolean;
  characteristics: Characteristic[];
  modifiers: Modifier[];
}

export interface Rule { id: string; name: string; description: string; hidden: boolean; modifiers: Modifier[] }

export interface InfoLink { id: string; targetId: string; type: 'profile' | 'rule' | 'infoGroup'; name: string; hidden: boolean; modifiers: Modifier[] }

export interface CategoryLink { id: string; targetId: string; primary: boolean; constraints: Constraint[]; modifiers: Modifier[] }

export type NodeKind = 'entry' | 'group' | 'link';

export interface Node {
  id: string;
  kind: NodeKind;
  name: string;
  /** model | unit | upgrade (entries) */
  entryType?: string;
  /** For links: the entry/group this link points to */
  targetId?: string;
  hidden: boolean;
  collective?: boolean;
  flatten?: boolean;
  defaultAmount?: number;
  defaultSelectionEntryId?: string;
  sortIndex?: number;
  costs: Record<string, number>;
  constraints: Constraint[];
  modifiers: Modifier[];
  profiles: Profile[];
  rules: Rule[];
  infoLinks: InfoLink[];
  categoryLinks: CategoryLink[];
  /** child node ids in document order: entries, groups then links */
  children: string[];
  comment?: string;
  catalogueId: string;
}

export interface ForceEntry {
  id: string;
  name: string;
  hidden: boolean;
  categoryLinks: CategoryLink[];
  constraints: Constraint[];
  modifiers: Modifier[];
  costs: Record<string, number>;
}

export interface Catalogue {
  id: string;
  name: string;
  revision: number;
  library: boolean;
  /** Root entry node ids (entryLinks + root selectionEntries) */
  rootIds: string[];
  forceEntries: ForceEntry[];
  /** Other catalogues whose root entries are imported */
  imports: string[];
}

export interface CostType { id: string; name: string; defaultLimit: number; hidden: boolean }
export interface ProfileType { id: string; name: string; characteristics: { id: string; name: string }[] }

export interface GamePack {
  format: 'muster-pack';
  formatVersion: 1;
  id: string; // game system id
  name: string;
  revision: number;
  source?: { kind: 'github' | 'files'; url?: string; importedAt: string };
  costTypes: CostType[];
  profileTypes: ProfileType[];
  categories: Record<string, string>;
  catalogues: Catalogue[];
  /** Root entries defined on the game system itself (visible in every catalogue) */
  systemRootIds: string[];
  systemForceEntries: ForceEntry[];
  nodes: Record<string, Node>;
  sharedProfiles: Record<string, Profile>;
  sharedRules: Record<string, Rule>;
  /** Optional art mapping: node name (lowercase) -> image url */
  art?: Record<string, string>;
}

// ---------------------------------------------------------------- rosters

export interface Selection {
  id: string;
  /** node id as it appears in the parent's children (may be a link id) */
  nodeId: string;
  number: number;
  children: Selection[];
  customName?: string;
  notes?: string;
  /** play-time tracking (wounds marked, fate, experience) */
  state?: { wounds?: number; fate?: number; xp?: number };
}

export interface Force {
  id: string;
  forceEntryId: string;
  catalogueId: string;
  selections: Selection[];
}

export interface Roster {
  id: string;
  name: string;
  packId: string;
  costLimits: Record<string, number>;
  forces: Force[];
  createdAt: string;
  updatedAt: string;
}
