# Mount Board Optimizer

A planner for the **Survivor.io** mount board that finds the highest-damage layout of your tetromino-shaped mount pieces. Supports all three mounts (Electric Scooter, Tech Hoverboard, Doomsteed) with their distinct board sizes, line-clear bonuses, and per-mount star levels.

**Live site:** https://incognit0123.github.io/component-calculator/

## What it does

You enter:

- Your **current pre-mount stat buffs** (the eight damage-related percentages you already have from gear, runes, etc.).
- Which **mounts** are unlocked, which one is currently equipped, and each unlocked mount's **star level** (tracked independently per mount).
- Your **inventory of mount pieces** — each piece's shape, quality tier, and which stat it buffs.

Pieces placed on the **equipped** mount's board grant their full stat buff and contribute to that mount's line-clear bonuses. Pieces placed on a **non-equipped (but unlocked)** mount's board grant only `syncRate%` of their full buff (mount/level dependent — e.g. a 2-yellow-star Tech Hoverboard syncs at 36%) and grant **no line bonuses**. The app fills the equipped board with the best pieces, then spills the remainder onto the next-highest-sync-rate unlocked mount, and so on.

The app searches over board layouts and piece selections and returns the one that maximizes your final damage multiplier, accounting for:

- The full damage formula — five independent multiplicative factors plus the additive group of `weakened`/`poisoned`/`chilled` debuff stats.
- **Per-mount line-clear bonuses** — each mount has its own tier table, gated by mount level, granting cumulative stat bonuses for completed rows on the **equipped** board only. Higher-tier line bonuses unlock as you raise the mount's star level. The Doomsteed's 8-line tier even scales dynamically with your `toPoisoned` total. The optimizer trades raw piece value against geometric line-fills.
- **Sync-rate scaling** for non-equipped boards: pieces still help you, just less, and they don't trigger line bonuses.
- **Diminishing returns** — because stats compound multiplicatively, the marginal value of a piece depends on the rest of the layout, so a greedy "best piece first" approach is not optimal.

There are two modes:

- **Normal** — fast; prunes branches that can't meaningfully improve the current best.
- **Full** — exhaustive within the regime that can possibly hold the optimum; slower but guaranteed-optimal under the model.

When you have multiple mounts unlocked, you can also choose to **optimize all unlocked mounts** (default) or **just the equipped one**.

Pieces, current stats, mode, equipped mount, per-mount unlocked status, per-mount star levels, and the optimize-all toggle are saved to `localStorage` so you don't lose your setup between sessions. Results are kept as-is when inputs change — the displayed layout reflects the inputs that produced it, not whatever they look like now.

You can also export your full setup as a single `mount-opt:v5:…` string and import it on another device. Older v1–v4 strings still import.

## Domain reference

- **Stats (8):** `critDamage`, `skillDamage`, `shieldDamage`, `toWeakened`, `toPoisoned`, `toChilled`, `laceration`, `toBosses`
- **Shapes (5):** `O`, `I`, `T`, `L`, `J` (no S/Z tetrominoes exist in-game)
- **Quality tiers (7):** `good`, `better`, `excellent`, `excellentPlus`, `epic`, `epicPlus`, `legend`
- **Mounts & boards (3):** Electric Scooter (8×7), Tech Hoverboard (8×9), Doomsteed (8×12)
- **Mount level:** 0–8 (4 yellow stars + 4 red stars), tracked independently per mount
- **Sync rate:** percentage of full piece buffs granted by a non-equipped mount's board, per-mount and per-level (Doomsteed tops out at 100% at 4 red stars; Electric Scooter starts at 20%)

## Development

```bash
npm install
npm run dev          # Vite dev server
npm run build        # type-check + production build
npx vitest run       # run the test suite
```

The project is React 19 + TypeScript + Vite, styled with Tailwind. The optimizer runs in a Web Worker so the UI stays responsive during a search.

## Docker Development

You can run everything in Docker without installing Node/npm on your host.

### Requirements

- Docker Desktop (or Docker Engine + Docker Compose plugin)

### Quick start

```bash
make build
```

This builds the image and starts the app in attached mode (you will see live logs). Open:

- http://localhost:5173

### Useful commands

```bash
make up       # start in background
make logs     # tail logs
make down     # stop containers
make clean    # stop containers and remove volumes
make shell    # open a shell in the app container
```

Notes:

- Source code is bind-mounted, so edits on host reflect inside the container.
- Dependencies live in a Docker-managed `node_modules` volume to avoid host pollution.
- The dev server listens on `0.0.0.0:5173` in the container and is published to your localhost.

## Deployment

`main` is automatically built, tested, and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
