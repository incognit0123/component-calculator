# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page React app that finds the optimal layout of Survivor.io "mount" tetromino pieces to maximize a damage-formula score. The user enters their pre-mount percent buffs for 8 stats, marks one or more of three mounts as **unlocked**, picks one of the unlocked mounts as **equipped**, sets each unlocked mount's star level, and enters their inventory of pieces. The app computes a board layout for every unlocked mount.

A piece placed on the **equipped** mount's board grants its full buff and contributes to line-clear bonuses. A piece placed on a **non-equipped (but unlocked)** mount's board grants only `syncRate%` of its buff (per-mount, per-level — see `MOUNTS[key].syncRates`) and grants **no line bonuses**. Each piece is on at most one board; pieces not placed anywhere are reported as Unused.

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
- **Mounts (3):** `electricScooter` (8×7), `techHoverboard` (8×9), `doomsteed` (8×12) — defined in `src/data/mounts.ts` (`MOUNTS` is the single source of truth: name, icon, bg color, board cols, line-bonus tiers, **per-level sync-rate table**). Use `MountKey` and `MOUNTS[key]` everywhere; never hardcode mount metadata.
- **Mount level (`MountLevel`, 0–8):** in `src/data/lineBonuses.ts`. Each line-bonus tier has an `unlockedAtLevel` gate; tiers above the player's current level are silently skipped. Levels persist **per mount** (each mount tracks its own stars).
- **Sync rate:** non-equipped mounts grant pieces only `syncRates[level]%` of their full buff. Per-mount table indexed by `MountLevel` (0..8) — values are absolute percentages, not cumulative. Helper: `syncRateFor(key, level)` in `src/data/mounts.ts`. The equipped mount always grants 100%.

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
- **Multi-mount = sequential, not joint.** Non-equipped boards' pieces are scaled (≤1) and grant no line bonuses, so any swap that moves a higher-marginal piece off the equipped board onto a non-equipped board is strictly worse. We optimize the equipped board with the full inventory, then the highest-sync-rate non-equipped mount with the leftover, and so on. No joint search needed.
- **Full-board (size-G) tilings are exact cover — rare and expensive.** Filling every cell forces a perfect tetromino tiling; only ~5% of full-board shape-mixes tile an 8×12 board and each infeasible attempt burns the whole node budget. This is why `solve.ts` processes non-full-board distributions first and why `fullBoardTilingPossible` exists. Corollary: on the widest board the search finds a near-optimal layout in seconds but often does **not** fully converge within a typical time limit (it keeps testing full-board mixes whose upper bound still beats the best), so results commonly come back `truncated` even when effectively optimal. Don't assume `truncated` means "bad result".

## Architecture

### Optimizer core (`src/optimizer/`)

Two modes (`normal`, `full`) share one entry point and one scoring function — never reimplement scoring in a specific mode.

The optimizer exploits **monotonicity** (every buff is non-negative, line bonuses are non-decreasing in lines) to decouple two subproblems: which shape-distribution to use, and which inventory pieces to assign to each slot. Adding any piece strictly improves the score, so the optimum lives at the largest tileable piece count.

- `types.ts` — `Placement`, `OptimizerInput` (carries `mountConfigs: MountConfig[]` — every unlocked mount, exactly one with `isEquipped: true`), `BoardSolveResult` (single-board internal type returned by `solve()`), `BoardResult` (per-mount slice of the user-facing aggregate), `OptimizerResult` (multi-mount aggregate with `boards: BoardResult[]`, `equippedMountKey`, aggregate `afterScore`), `BOARD_ROWS` (= 8). There is **no `BOARD_COLS`** — column count is per-mount and threaded as a `cols` argument
- `board.ts` — bitboard using `BigInt` (`bit = row*cols + col`). All board ops are parameterized by `cols`: `boardBits(cols)`, `fullRowMasks(cols)`, `fullBoard(cols)`, `bitFor(row, col, cols)`, `countFullRows(occ, cols)`, `placementsForShape(shape, cols)`, `occupancyTo2D(occ, cols)`. Row masks, full-board masks, and per-shape placement tables are cached keyed on `cols`
- `scoring.ts` — `formula()`, `applyLineBonuses(stats, lines, tiers, mountLevel)`, `scoreLayout(currentStats, picks, lines, tiers, mountLevel, pieceBuffMultiplier?)` (the canonical scoring entry point), `finalizeStats(...)`, `addPieceBuffs(stats, pieces, multiplier?)`. The `pieceBuffMultiplier` (default 1) scales every piece's contribution before adding — sync-rate scaling lives here, **not** in a separate code path. **Tiers are passed in** — never reach into a global tier list
- `tiling.ts` — `enumerateDistributions(inventory, totalPieces)` yields shape-count tuples; `tileDistribution(dist, cols, targetLines?, opts?)` does branch-and-bound DFS to find a line-maximizing packing onto an 8×cols board. Capped at `TILE_NODE_BUDGET` DFS visits per call to bound exhaustion on untileable shape mixes — caller treats null as "no tiling found". `opts: TileOptions` carries an optional `deadline` (abort the DFS once `performance.now()` passes it — checked every `DEADLINE_CHECK_INTERVAL` nodes so a single call can't overshoot the solver's time budget) and `nodeBudget` override. `fullBoardTilingPossible(dist, cols)` is a **provable** necessary-condition prefilter for *full-board* distributions (checkerboard coloring ⇒ an odd T-count can't fully tile), applied inside `tileDistribution` to reject ~40% of full-board mixes instantly instead of burning the node budget; it returns `true` (inapplicable) when the distribution leaves cells empty.
- `selection.ts` — `selectPieces(inventory, dist, lineCount, currentStats, tiers, mountLevel, pieceBuffMultiplier?)`: given a fixed shape-distribution and line count, picks `dist[shape]` pieces of each shape from inventory to maximize the formula. DFS with multiplicative ratio upper bound (admissible because diminishing returns can only shrink each piece's marginal during accumulation). The multiplier is folded into `bucket.buff` once, so both DFS and bound use scaled values throughout.
- `solve.ts` — single-board solver. Looks up the mount via `MOUNTS[mountKey]` at entry, derives `cols`, `tiers`, `boardBits`, `geometricMaxPieces` per call, threads them through. Accepts `pieceBuffMultiplier` (default 1) and `disableLineBonuses` (when true, internally sets `tiers = []` regardless of mount level — used by `solveAll` for non-equipped boards). Two regimes:
  - K < G (inventory smaller than geometric max): tile the entire inventory; if untileable, drop one piece and retry
  - K ≥ G: enumerate distributions of size G, G-1, G-2; rank by an admissible upper bound; for each (in rank order) call `tileDistribution` (with `{ deadline }` threaded through) then `selectPieces`. Prune by current best. `mode: 'normal'` adds a fractional-improvement threshold (`normalToleranceEps`). **Ordering: non-full-board distributions are processed before full-board ones** (the `full` flag on each ranked entry sorts ahead of the upper bound). Full boards force an exact-cover tiling that is rarely feasible and expensive to attempt/disprove (≈5% of full-board mixes tile an 8×12 board, ~341ms each to fail), whereas near-full distributions tile in ~12ms; doing them first finds a near-optimal `best` within ~1s that prunes most full-board candidates by upper bound. This only changes *pruning order* — the loop uses `continue`, so every non-pruned distribution is still evaluated and the exact optimum is preserved. (Historically the reverse order left the equipped Doomsteed board **empty** because the whole time budget was spent disproving full-board tilings before any layout was found.)
- `solveAll.ts` — multi-board orchestrator. Validates `mountConfigs` (exactly one `isEquipped`), then optimizes boards in order: equipped first (full buffs, real tiers), then non-equipped by **descending sync rate** (each with `pieceBuffMultiplier = syncRate/100`, `disableLineBonuses: true`). Threads accumulated stats forward so each subsequent solve sees the running diminishing-returns picture. Time budget is **per-board** — each `solve` gets a fresh `timeBudgetMs`, so a truncation on board 1 doesn't starve later boards (they still optimize the leftover inventory under the same budget). `BoardResult.buffsFromPieces` is always **unscaled** (full piece buffs); UI scales by `syncRate` at display time. Each board's `solved.truncated` is propagated onto `BoardResult.truncated` so the UI can tell a board that timed out before placing anything from a legitimately empty one.
- `worker.ts` — DedicatedWorker entry; forwards messages to `solveAll()`, emits `progress` (with `currentMountKey`) and `done` messages

### UI + state (`src/components/`, `src/App.tsx`, `src/hooks/`)

- `useOptimizer` owns a long-lived Worker, dispatches `run()` / `cancel()`, maintains `{ running, result, error, progress }`. Progress events include `currentMountKey` so the UI can show which board is currently being optimized. The worker is terminated on unmount.
- `usePersistedState` is a `useState`-shaped wrapper around `localStorage`. Versioned keys: `mount-opt:current-stats:v1`, `mount-opt:pieces:v1`, `mount-opt:mode:v1`, `mount-opt:selected-mount:v1`, `mount-opt:mount-levels:v1` (one entry per mount), `mount-opt:unlocked-mounts:v1` (per-mount boolean), `mount-opt:optimize-scope:v1` (`'allUnlocked'` or `'equippedOnly'`), `mount-opt:full-time-limit:v1`, `mount-opt:profiles:v1`. The legacy `mount-opt:mount-level:v1` key is migrated on read into `mountLevels.electricScooter` and otherwise ignored. New users default to **only the previously-selected mount being unlocked** so the legacy single-mount UI is preserved until the user explicitly unlocks more.
- `MountPanel` is the 3-up mount picker (lock toggle + icon + per-mount stars + sync-rate readout). The lock toggle on the last-unlocked mount is disabled (≥1 must always be unlocked). Locking the equipped mount auto-switches the equipped to the first remaining unlocked mount (handled in `App.handleUnlockedChange`). Locked mounts can't be selected as equipped (button disabled).
- `OptimizerPanel` exposes a scope toggle (`'allUnlocked'` vs `'equippedOnly'`) **only when 2+ mounts are unlocked**. With one unlocked or `equippedOnly`, only the equipped mount is in `mountConfigs` and the result has a single board.
- **Result section:** when `result.boards.length > 1`, a row of `MountBoardPreview` thumbnails sits below the main `BoardView`, with the active one outlined; clicking switches `displayedMountKey`. The header score is the **aggregate** (`result.afterScore` / `result.beforeScore`), already computed across every board by `solveAll`. The main board view label includes `(equipped)` for the equipped mount. `StatsSummary` accepts `tabs` + `activeTabId`: the All-mounts tab sums sync-scaled piece contributions and shows equipped-only line bonuses; per-mount equipped tab matches today's view; per-mount non-equipped replaces the `+ Lines` column with `(× X% sync rate)` showing pieces × syncRate in dimmed blue. All-mounts and non-equipped tabs round contributions to 0.01. When the final (non-running) result has any board that is `truncated` **and** has zero placements, `App` renders an amber warning naming those mounts and prompting the user to raise/disable the time limit — this is the "time limit too low to find any layout" case (distinct from a board that's empty because there were no pieces left for it).
- **Result is "frozen" against the inputs that produced it.** The result is rendered as-is — modifying inventory, mount level, equipped mount, or unlock toggles after a result is shown does **not** re-derive placements, scores, or stats. Pieces removed from inventory simply don't render; everything else stays consistent with what `solveAll` reported. (Predecessor versions tried to re-clip placements when the equipped mount changed; that logic is gone.)
- **Export format:** strings are prefixed `mount-opt:vN:`. Current is **v5**, which adds `u: { es, th, ds }` (unlocked map, 1/0) and `os` (optimize scope: `'a' | 'e'`) on top of v4's mount key + per-mount levels. v1–v4 importers continue to work — older imports default `unlockedMounts` to "selected only" and `optimizeScope` to `'allUnlocked'`. On v5 import the equipped mount is force-unlocked even if the imported map says otherwise (defensive against hand-edited strings).
- `OptimizerResult` and `BoardResult` are fully serializable (no BigInts) so they cross the worker boundary cleanly. Don't put `bigint` in any worker-bound type.

### TypeScript config notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` and `erasableSyntaxOnly: true`. This means:

- Use `import type { ... }` for type-only imports (a plain `import` of a type will fail to build).
- Enums and namespaces are disallowed — use union string literal types (`type Foo = 'a' | 'b'`).

`vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test` block is typed.
