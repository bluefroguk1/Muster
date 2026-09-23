# Muster game pack format (v1)

A game pack is a single JSON document (`format: "muster-pack"`, `formatVersion: 1`) produced from BattleScribe XML or authored directly. Types live in `src/engine/types.ts`.

| Field | Meaning |
|---|---|
| `id`, `name`, `revision` | Game system identity |
| `costTypes[]` | `{ id, name, defaultLimit, hidden }` |
| `profileTypes[]` | `{ id, name, characteristics[{id,name}] }` |
| `categories` | `{ [id]: name }` |
| `catalogues[]` | factions: `{ id, name, rootIds[], forceEntries[], imports[] }` |
| `systemRootIds[]` | entries available to every faction |
| `nodes` | every entry / group / link, keyed by id |
| `sharedProfiles`, `sharedRules` | targets of info links |

A **node** has `kind` (`entry` \| `group` \| `link`), `costs`, `constraints`, `modifiers`, `profiles`, `rules`, `infoLinks`, `categoryLinks` and ordered `children`.

A **modifier** is `{ type, field, value, arg?, scope?, affects?, when: ConditionGroup, repeats[] }`.
`field` is one of `hidden`, `name`, `defaultAmount`, `category`, `info`, `annotation`, a cost-type id, a constraint id or a characteristic-type id.

A **roster** is `{ id, name, packId, costLimits, forces[{ forceEntryId, catalogueId, selections[] }] }`, where each selection is `{ id, nodeId, number, children[], customName? }`.
