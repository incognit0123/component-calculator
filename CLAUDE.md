# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page React app that finds the optimal layout of Survivor.io "mount" tetromino pieces to maximize a damage-formula score. The user enters their pre-mount percent buffs for 8 stats, picks one of three mounts, sets that mount's star level, and enters their inventory of pieces (each piece has a shape, quality tier, and the stat it buffs); the app computes a board layout that maximizes the score.

The board is always **8 rows**, but the column count varies by mount (7/9/12). `BOARD_ROWS` in `src/optimizer/types.ts` is the authoritative row count. Column count is per-mount data (`MOUNTS[mountKey].cols`) and is threaded through the optimizer as a `cols` parameter — do not hardcode `7`/`8`/`9`/`12` and do not assume a single board width.

## Commands

```
npm run dev                               # Vite dev server
npm run build                             # tsc -b && vite build
npx vitest run                            # one-shot test suite
npx vitest run src/optimizer/scoring      # run a single test file
npx vitest run -t "L=3 adds"              # run a single test by name
npx tsc -b                                # typecheck only
```

## Domain model

Canonical data lives in code — don't duplicate these values elsewhere, look them up:

- **Stats (8):** `critDamage`, `skillDamage`, `shieldDamage`, `toWeakened`, `toPoisoned`, `toChilled`, `laceration`, `toBosses` — defined in `src/data/types.ts`, display metadata in `src/data/stats.ts`. All values are percentages (e.g. `15` means +15%).
- **Shapes (5):** `O`, `I`, `T`, `L`, `J`. S- and Z-tetrominoes do **not** exist. Rotation tables in `src/data/shapes.ts` are pre-normalized (min row/col = 0) and deduplicated at module load: `O` has 1 rotation, `I` has 2, `T`/`L`/`J` each have 4. A `Placement`'s `rotation` field indexes into `SHAPE_ROTATIONS[shape]`.
- **Quality tiers (7):** `good`, `better`, `excellent`, `excellentPlus`, `epic`, `epicPlus`, `legend` — defined in `src/data/types.ts`. Buff magnitudes are `BUFF_TABLE[quality][stat]` in `src/data/buffTable.ts`.
- **Piece:** `{ id, shape, quality, stat }`. Its buff value is `BUFF_TABLE[piece.quality][piece.stat]`.
- **Mounts (3):** `electricScooter` (8×7), `techHoverboard` (8×9), `doomsteed` (8×12) — defined in `src/data/mounts.ts` (`MOUNTS` is the single source of truth: name, icon, bg color, board cols, line-bonus tiers). Use `MountKey` and `MOUNTS[key]` everywhere; never hardcode mount metadata.
- **Mount level (`MountLevel`, 0–8):** in `src/data/lineBonuses.ts`. Each line-bonus tier has an `unlockedAtLevel` gate; tiers above the player's current level are silently skipped. Levels persist **per mount** (each mount tracks its own stars).

### Damage formula (`src/optimizer/scoring.ts`)

```
score =
    (1 + critDamage/100)
  * (1 + skillDamage/100)
  * (1 + shieldDamage/100)
  * (1 + laceration/100)
  * (1 + toBosses/100)
  * (1 + (toWeakened + toPoisoned + toChilled)/100)
```

The three debuff-conditional stats (weakened / poisoned / chilled) sum **inside a single `(1 + x/100)` factor** — they compete additively with each other, while the other five each get their own multiplicative factor.

### Line-clear bonuses (`applyLineBonuses` in `src/optimizer/scoring.ts`)

A "line" is a fully occupied **row** (columns don't count). Bonuses are cumulative — each tier stacks on top of lower tiers. The exact tier table varies per mount; the canonical tables live in `src/data/mounts.ts` and are passed in via the `tiers: LineBonusTier[]` parameter — **never duplicate these values**.

A `LineBonusTier` has either:

- `bonus: Partial<StatTotals>` — a static increment, or
- `compute: (statsSoFar) => Partial<StatTotals>` — a dynamic increment computed against fully-accumulated running stats (pre-mount + piece buffs + earlier line tiers). Used for Doomsteed's 8-line `toBosses` tier, which scales with `toPoisoned`. Tiers must be ordered so any `compute` tier comes after every tier whose static contribution it depends on.

Each tier also has `unlockedAtLevel: MountLevel` (a `>4`-line tier `T` typically unlocks at level `2*(T-4)`, so 5-line at lvl 2, 6 at lvl 4, 7 at lvl 6, 8 at lvl 8). Tiers gated above the player's current mount level are silently skipped, which means raising mount level can only increase the score for a given layout. Bonuses run from 1 line up to 8 lines (every mount has tiers extending up to 8).

Use `maxBonusLinesForLevel(level, tiers)` to find the highest line count that can grant any bonus for a given mount level / tier list — values past that don't change the score.

### Non-obvious rules

These bite if you forget them — re-derive them from here or the code, not from memory:

- **Scoring is non-linear** — a piece's marginal value depends on which other pieces are already placed (a high-value Skill Damage piece is worth less once Skill Damage is already inflated). Never reduce scoring to a per-piece sum; greedy "pick the best piece first" is often suboptimal.
- **Within a fixed shape-distribution, max-line tiling always wins** — different tilings of the same distribution share the same buff sum (selection is decoupled from placement), so only the line count varies, and line bonuses are non-decreasing in lines.
- **Adding any piece strictly improves the score** — so the K ≥ G regime only enumerates near-full distributions (G, G-1, G-2). Sub-G distributions could only beat them if the geometry forces leaving more cells empty, which the G/G-1/G-2 sweep already captures.

## Architecture

### Optimizer core (`src/optimizer/`)

Two modes (`normal`, `full`) share one entry point and one scoring function — never reimplement scoring in a specific mode.

The optimizer exploits **monotonicity** (every buff is non-negative, line bonuses are non-decreasing in lines) to decouple two subproblems: which shape-distribution to use, and which inventory pieces to assign to each slot. Adding any piece strictly improves the score, so the optimum lives at the largest tileable piece count.

- `types.ts` — `Placement`, `OptimizerInput` (carries `mountKey` + `mountLevel`), `OptimizerResult` (carries the `mountKey` it was solved against), `BOARD_ROWS` (= 8). There is **no `BOARD_COLS`** — column count is per-mount and threaded as a `cols` argument
- `board.ts` — bitboard using `BigInt` (`bit = row*cols + col`). All board ops are parameterized by `cols`: `boardBits(cols)`, `fullRowMasks(cols)`, `fullBoard(cols)`, `bitFor(row, col, cols)`, `countFullRows(occ, cols)`, `placementsForShape(shape, cols)`, `occupancyTo2D(occ, cols)`. Row masks, full-board masks, and per-shape placement tables are cached keyed on `cols`
- `scoring.ts` — `formula()`, `applyLineBonuses(stats, lines, tiers, mountLevel)`, `scoreLayout(currentStats, picks, lines, tiers, mountLevel)` (the canonical scoring entry point), `finalizeStats(...)`. **Tiers are passed in** — never reach into a global tier list
- `tiling.ts` — `enumerateDistributions(inventory, totalPieces)` yields shape-count tuples; `tileDistribution(dist, cols, targetLines?)` does branch-and-bound DFS to find a line-maximizing packing onto an 8×cols board. Capped at `TILE_NODE_BUDGET` DFS visits per call to bound exhaustion on untileable shape mixes — caller treats null as "no tiling found"
- `selection.ts` — `selectPieces(inventory, dist, lineCount, currentStats, tiers, mountLevel)`: given a fixed shape-distribution and line count, picks `dist[shape]` pieces of each shape from inventory to maximize the formula. DFS with multiplicative ratio upper bound (each piece's standalone marginal multiplier is admissible because diminishing returns can only shrink it during accumulation)
- `solve.ts` — top-level orchestrator. Looks up the mount via `MOUNTS[mountKey]` at entry, derives `cols`, `tiers`, `boardBits`, `geometricMaxPieces` per call, threads them through. Two regimes:
  - K < G (inventory smaller than geometric max): tile the entire inventory; if untileable, drop one piece and retry
  - K ≥ G: enumerate distributions of size G, G-1, G-2; rank by an admissible upper bound; for each (in rank order) call `tileDistribution` then `selectPieces`. Prune by current best. `mode: 'normal'` adds a fractional-improvement threshold (`normalToleranceEps`)
- `worker.ts` — DedicatedWorker entry; forwards messages to `solve()` (passes through `mountKey` + `mountLevel`), emits `progress` and `done` messages

### UI + state (`src/components/`, `src/App.tsx`, `src/hooks/`)

- `useOptimizer` owns a long-lived Worker, dispatches `run()` / `cancel()`, maintains `{ running, result, error, progress }`. The worker is terminated on unmount.
- `usePersistedState` is a `useState`-shaped wrapper around `localStorage`. Versioned keys: `mount-opt:current-stats:v1`, `mount-opt:pieces:v1`, `mount-opt:mode:v1`, `mount-opt:selected-mount:v1`, `mount-opt:mount-levels:v1` (one entry per mount), `mount-opt:full-time-limit:v1`, `mount-opt:profiles:v1`. The legacy `mount-opt:mount-level:v1` key is migrated on read into `mountLevels.electricScooter` and otherwise ignored.
- `MountPanel` is the 3-up mount picker (icon background + per-mount stars). `App.tsx` maintains `selectedMountKey` plus per-mount `mountLevels`; the optimizer only sees the *selected* mount's level. `BoardView` takes `cols` as a prop and sizes its grid off it.
- **Result clipping for mount switches:** `OptimizerResult` carries the `mountKey` it was solved against. `App.tsx` derives a `displayedResult` clipped to the currently *selected* mount's `cols` — placements past the right edge move to "Unused", lines are recounted on the narrower board, and stats are recomputed via `finalizeStats` against the selected mount's tiers/level. Switching back to the original (or wider) mount restores the original placements because we always derive from the immutable `result.placements` list.
- **Export format:** strings are prefixed `mount-opt:vN:`. Current is **v4**, which encodes selected mount key + per-mount levels (`mt`, `lv: { es, th, ds }`). v1/v2/v3 importers continue to work — on v3 import we set `mountLevels.electricScooter = parsed.l` and leave the others at 0; selected mount stays at the default (Electric Scooter).
- `OptimizerResult` is fully serializable (no BigInts) so it crosses the worker boundary cleanly. Don't put `bigint` in any worker-bound type.

### TypeScript config notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` and `erasableSyntaxOnly: true`. This means:

- Use `import type { ... }` for type-only imports (a plain `import` of a type will fail to build).
- Enums and namespaces are disallowed — use union string literal types (`type Foo = 'a' | 'b'`).

`vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test` block is typed.
