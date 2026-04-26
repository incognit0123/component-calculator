# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page React app that finds the optimal layout of Survivor.io "mount" tetromino pieces on an **8 rows × 7 columns** board to maximize a damage-formula score. The user enters their pre-mount percent buffs for 8 stats plus their inventory of pieces (each piece has a shape, quality tier, and the stat it buffs); the app computes a board layout that maximizes the score. `BOARD_ROWS` / `BOARD_COLS` in `src/optimizer/types.ts` are the authoritative board dimensions — do not hardcode `8`.

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

A "line" is a fully occupied **row** (columns don't count). Bonuses are cumulative — each tier stacks on top of lower tiers:

| L | Adds |
|---|---|
| 1+ | `toWeakened +10` |
| 3+ | `toWeakened +15`, `critDamage +20` |
| 4+ | `critDamage +35` |

At L=4 the totals are `toWeakened +25` (10 + 15) and `critDamage +55` (20 + 35). Nothing scales past L=4.

### Non-obvious rules

These bite if you forget them — re-derive them from here or the code, not from memory:

- **Scoring is non-linear** — a piece's marginal value depends on which other pieces are already placed (a high-value Skill Damage piece is worth less once Skill Damage is already inflated). Never reduce scoring to a per-piece sum; greedy "pick the best piece first" is often suboptimal.
- **Within a fixed shape-distribution, max-line tiling always wins** — different tilings of the same distribution share the same buff sum (selection is decoupled from placement), so only the line count varies, and line bonuses are non-decreasing in lines.
- **Adding any piece strictly improves the score** — so the K ≥ G regime only enumerates near-full distributions (G, G-1, G-2). Sub-G distributions could only beat them if the geometry forces leaving more cells empty, which the G/G-1/G-2 sweep already captures.

## Architecture

### Optimizer core (`src/optimizer/`)

Two modes (`normal`, `full`) share one entry point and one scoring function — never reimplement scoring in a specific mode.

The optimizer exploits **monotonicity** (every buff is non-negative, line bonuses are non-decreasing in lines) to decouple two subproblems: which shape-distribution to use, and which inventory pieces to assign to each slot. Adding any piece strictly improves the score, so the optimum lives at the largest tileable piece count.

- `types.ts` — `Placement`, `OptimizerResult`, `BOARD_ROWS` / `BOARD_COLS`, worker message types
- `board.ts` — bitboard using `BigInt` (`bit = row*BOARD_COLS + col`), precomputed placement enumeration per shape (`placementsForShape`), row-fill detection, `popcount`. Row mask width is `BOARD_COLS` — do not assume 8
- `scoring.ts` — `formula()`, `applyLineBonuses()`, `scoreLayout()` (the canonical scoring entry point)
- `tiling.ts` — `enumerateDistributions(inventory, totalPieces)` yields shape-count tuples; `tileDistribution(dist, targetLines)` does branch-and-bound DFS to find a line-maximizing packing of those shape counts onto the board. Capped at `TILE_NODE_BUDGET` DFS visits per call to bound exhaustion on untileable shape mixes — caller treats null as "no tiling found"
- `selection.ts` — `selectPieces(inventory, dist, lineCount, currentStats)`: given a fixed shape-distribution and line count, picks `dist[shape]` pieces of each shape from inventory to maximize the formula. DFS with multiplicative ratio upper bound (each piece's standalone marginal multiplier is admissible because diminishing returns can only shrink it during accumulation)
- `solve.ts` — top-level orchestrator. Two regimes:
  - K < G (inventory smaller than geometric max): tile the entire inventory; if untileable, drop one piece and retry
  - K ≥ G: enumerate distributions of size G, G-1, G-2; rank by an admissible upper bound; for each (in rank order) call `tileDistribution` then `selectPieces`. Prune by current best. `mode: 'normal'` adds a fractional-improvement threshold (`normalToleranceEps`)
- `worker.ts` — DedicatedWorker entry; forwards messages to `solve()`, emits `progress` and `done` messages

### UI + state (`src/components/`, `src/App.tsx`, `src/hooks/`)

- `useOptimizer` owns a long-lived Worker, dispatches `run()` / `cancel()`, maintains `{ running, result, error, progress }`. The worker is terminated on unmount.
- `usePersistedState` is a `useState`-shaped wrapper around `localStorage`. Pieces, current stats, and mode each persist under a versioned key (`mount-opt:*:v1`).
- `OptimizerResult` is fully serializable (no BigInts) so it crosses the worker boundary cleanly. Don't put `bigint` in any worker-bound type.

### TypeScript config notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` and `erasableSyntaxOnly: true`. This means:

- Use `import type { ... }` for type-only imports (a plain `import` of a type will fail to build).
- Enums and namespaces are disallowed — use union string literal types (`type Foo = 'a' | 'b'`).

`vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test` block is typed.
