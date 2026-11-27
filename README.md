# Mount Board Optimizer

A planner for the **Survivor.io** mount board that searches for high-damage layouts of your tetromino-shaped mount pieces. Supports Electric Scooter, Tech Hoverboard, Doomsteed, Netherflame Stalker, and Ruinous Warskitter, with their board sizes, line-clear bonuses, and per-mount star levels.

**Live site:** https://incognit0123.github.io/component-calculator/

## What it does

You enter:

- Your **current pre-mount stat buffs**, including Vulnerability, before any equipped mount effects or component bonuses.
- Which **mounts** are unlocked, which one is currently equipped, and each unlocked mount's **star level** (tracked independently per mount).
- Your **inventory of mount pieces** — each piece's shape, quality tier, and which stat it buffs.

Pieces placed on the **equipped** mount's board grant their full stat buff and contribute to that mount's line-clear bonuses. Pieces placed on a **non-equipped (but unlocked)** mount's board grant `syncRate%` of their full buff and no line bonuses. The fast search fills boards sequentially, then improves the combined score by moving pieces into higher-sync gaps and exchanging same-shape pieces between boards and with unused inventory. Mounts left without pieces remain visible in the results, with previews labeled **Empty board**.

The app searches over board layouts and piece selections and returns the one that maximizes your final damage multiplier, accounting for:

- The damage formula — six independent multiplicative factors, including Vulnerability, plus the additive group of `weakened`/`poisoned`/`chilled` debuff stats. Existing and mount Vulnerability add together inside their own `(1 + Vulnerability/100)` factor.
- Equal-score elemental choices favor your highest starting elemental stat when matching-shape, matching-grade parts are available. Tied starting stats fall back to Chilled, Poisoned, then Weakened.
- **Per-mount line-clear bonuses** — each mount has its own tier table, gated by mount level, granting cumulative stat bonuses for completed rows on the **equipped** board only. Higher-tier line bonuses unlock as you raise the mount's star level. The Doomsteed's 8-line tier even scales dynamically with your `toPoisoned` total. The optimizer trades raw piece value against geometric line-fills.
- **Sync-rate scaling** for non-equipped boards: pieces still help you, just less, and they don't trigger line bonuses.
- **Diminishing returns** — because stats compound multiplicatively, the marginal value of a piece depends on the rest of the layout, so a greedy "best piece first" approach is not optimal.

The optimizer uses a fast heuristic search followed by cross-mount refinement. Results are labeled **Best found**; completion does not prove global optimality. The time limit applies separately to each board, followed by a short refinement pass. Cancellation or a time limit preserves the best layout found.

Doomsteed's dynamic tier uses pre-mount stats, equipped pieces and earlier equipped tiers; synced boards then add their piece buffs.

**Ruinous Warskitter:** all eight row bonuses are implemented from the supplied mount description and cross-checked against Expo's deployed calculator on November 18, 2026. Scoring assumes maintained Ruinous Shot Vulnerability, five Enhancement stacks after 250 shots, and the requested maximum six Shield stacks. The equipped base effect grants +30% Vulnerability even before completing a row. Four rows give a cumulative +130% Vulnerability, +40% Chilled, +15% Boss Damage and +25% Shield Damage. Eight rows at four red stars give +230% Vulnerability, +100% Chilled, +40% Boss Damage and +140% Shield Damage. The second row extends Vulnerability duration from 5 to 10 seconds; it does not increase the magnitude under the maintained-debuff assumption. Synced Ruinous boards grant component buffs only. The board is 8×12 and uses the shared Legendary mount sync rates. Direct mount attack damage is excluded. Result notes explain the uptime and stack assumptions. Enter your existing pre-mount Vulnerability so the incremental gain is calculated correctly. See the [source audit and artwork provenance](docs/notes/ruinous-warskitter-exp0-audit.md) for the comparison with Expo's row-2 treatment of the base effect.

When you have multiple mounts unlocked, you can also choose to **optimize all unlocked mounts** (default) or **just the equipped one**.

Pieces, current stats, equipped mount, per-mount unlocked status, per-mount star levels, and the optimize-all toggle are saved to `localStorage` so you don't lose your setup between sessions. Results are kept as-is when inputs change — the displayed layout reflects the inputs that produced it, not whatever they look like now.

You can also export your full setup as a single `mount-opt:v10:…` string and import it on another device, including pre-mount Vulnerability and Ruin's unlock status and star level. Older v1–v9 strings still import with Vulnerability set to zero; v1–v8 default Ruin to locked at level zero, and pre-v7 strings also default Netherflame Stalker to locked. Existing local saves and profiles preserve their mounts, levels, stats and inventory. Retired search-mode preferences are ignored.

## Importing components from the game

Instead of entering pieces one by one, use **Import from game** in the inventory panel:

1. In the game, uninstall all components, so the **Install Component** list holds every piece. Installed pieces don't show their stat without tapping each one.
2. Open **Install Component** and start your phone's screen recorder.
3. For each stat in the **Filter** menu: select it, then scroll slowly to the bottom of the list.
4. Stop the recording and upload it. Screenshots also work for lists that fit on one screen.

On Android you can let [the capture helper](tools/capture/README.md) do the tapping and recording over USB.

The app reads the active filter's icon and each piece's shape and tier, follows the scroll so every piece is counted once, and opens **Bulk edit** with the result for you to check before applying. Stats you didn't record keep their current pieces. The recording is processed in your browser and never uploaded.

## Domain reference

- **Component stats (8):** `critDamage`, `skillDamage`, `shieldDamage`, `toWeakened`, `toPoisoned`, `toChilled`, `laceration`, `toBosses`. **Vulnerability** is an additional player/mount stat; there are no Vulnerability components.
- **Shapes (5):** `O`, `I`, `T`, `L`, `J` (no S/Z tetrominoes exist in-game)
- **Quality tiers (7):** `good`, `better`, `excellent`, `excellentPlus`, `epic`, `epicPlus`, `legend`
- **Mounts & boards (5):** Electric Scooter (8×7), Tech Hoverboard (8×9), Doomsteed (8×12), Netherflame Stalker (8×12), Ruinous Warskitter (8×12)
- **Mount level:** 0–8 (4 yellow stars + 4 red stars), tracked independently per mount
- **Sync rate:** percentage of full piece buffs granted by a non-equipped mount's board. Doomsteed, Netherflame Stalker, and Ruinous Warskitter share a table from 60% at zero stars to 200% at four red stars, as updated in [Expo's calculator](https://sio-tools.exp0.dev/) on November 21, 2026.

## Development

```bash
npm install
npm run dev          # Vite dev server
npm run build        # type-check + production build
npx vitest run       # run the test suite
```

On Node versions whose native Web Storage interferes with jsdom, run tests with `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`. CI and Docker use Node 20.

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
