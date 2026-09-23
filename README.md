# Muster

An offline-first warband and army builder for tabletop games — a modern take on New Recruit / BattleScribe.

- **Import any game** from a New Recruit / BattleScribe data repository on GitHub, or from `.gst`/`.cat` files. Games are compiled once into a JSON *game pack* and stored on the device.
- **Works offline** as an installable PWA on phones, tablets and desktop. Rosters live in IndexedDB; nothing needs a server.
- **Live rules engine**: costs, modifiers, conditions, hidden options, constraints and validation errors.
- **Art from your own rulebook**: load your ePUB and Muster pulls the illustrations into this browser only (never uploaded or bundled).
- **Printable band sheets** (cards view → Print / save PDF).
- **Backups**: export/import bands, game packs (`.json`) and full backups.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests against Burrows & Badgers data
npm run build && npm run preview
```

## Deploy

Static hosting only — no backend.

- **GitHub Pages**: push to `main`; `.github/workflows/pages.yml` builds with `BASE=/<repo>/` and deploys. Enable *Settings → Pages → Source: GitHub Actions*.
- **Cloudflare Pages / Netlify**: build command `npm run build`, output `dist`.

## How it works

```
.gst/.cat (XML) ──compile──▶ GamePack (JSON) ──▶ IndexedDB
                                   │
                    Roster (JSON) ─┴─▶ RosterEngine ──▶ UI
```

- `src/engine/compile.ts` — XML → `GamePack` (see `docs/pack-format.md`).
- `src/engine/roster.ts` — evaluates modifiers (set/increment/decrement/append/replace/add/remove, repeats), conditions (scopes self/parent/root-entry/force/roster/ancestor, instanceOf), constraints and costs.
- `src/lib/importer.ts` — GitHub and file import.
- `src/lib/art.ts` — ePUB art extraction, with hand-tuned matches for Burrows & Badgers.

## Art and copyright

Rulebook art belongs to its publisher. Muster never ships it: each user imports art from their own purchased ePUB, and it stays in their browser. Don't commit ePUBs or extracted images (`.gitignore` blocks them).

## Roadmap

- Optional accounts + sync (e.g. Supabase) behind the existing IndexedDB layer
- Campaign tracking (XP, injuries, treasury, den) as first-class screens
- In-app pack editor so games can be authored as JSON without XML
