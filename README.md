# Mount Board Optimizer

A planner for the **Survivor.io** mount board that finds the highest-damage layout of your tetromino-shaped mount pieces on the 8×7 board.

**Live site:** https://incognit0123.github.io/component-calculator/

## What it does

You enter:

- Your **current pre-mount stat buffs** (the eight damage-related percentages you already have from gear, runes, etc.).
- Your **inventory of mount pieces** — each piece's shape, quality tier, and which stat it buffs.

The app searches over board layouts and piece selections and returns the one that maximizes your final damage multiplier, accounting for:

- The full damage formula — five independent multiplicative factors plus the additive group of `weakened`/`poisoned`/`chilled` debuff stats.
- **Line-clear bonuses** — fully-filled rows grant cumulative bonuses to `toWeakened` (+10/+25) and `critDamage` (+20/+55), so the optimizer trades raw piece value against geometric line-fills.
- **Diminishing returns** — because stats compound multiplicatively, the marginal value of a piece depends on the rest of the layout, so a greedy "best piece first" approach is not optimal.

There are two modes:

- **Normal** — fast; prunes branches that can't meaningfully improve the current best.
- **Full** — exhaustive within the regime that can possibly hold the optimum; slower but guaranteed-optimal under the model.

Pieces, current stats, and mode are saved to `localStorage` so you don't lose your inventory between sessions.

## Domain reference

- **Stats (8):** `critDamage`, `skillDamage`, `shieldDamage`, `toWeakened`, `toPoisoned`, `toChilled`, `laceration`, `toBosses`
- **Shapes (5):** `O`, `I`, `T`, `L`, `J` (no S/Z tetrominoes exist in-game)
- **Quality tiers (7):** `good`, `better`, `excellent`, `excellentPlus`, `epic`, `epicPlus`, `legend`
- **Board:** 8 rows × 7 columns

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
