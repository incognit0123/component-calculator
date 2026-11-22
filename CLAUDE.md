# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page React app that finds the optimal layout of Survivor.io "mount" tetromino pieces to maximize a damage-formula score. The user enters their pre-mount percent buffs for nine stats (eight component stats plus Vulnerability), marks one or more of the five mounts as **unlocked**, picks one of the unlocked mounts as **equipped**, sets each unlocked mount's star level, and enters their inventory of pieces. The app computes a board layout for every unlocked mount.

A piece placed on the **equipped** mount's board grants its full buff and contributes to line-clear bonuses. A piece placed on a **non-equipped (but unlocked)** mount's board grants only `syncRate%` of its buff (per-mount, per-level — see `MOUNTS[key].syncRates`) and grants **no line bonuses**. Each piece is on at most one board; pieces not placed anywhere are reported as Unused.

The board is always **8 rows**, but the column count varies by mount (7/9/12; note two mounts share width 12). `BOARD_ROWS` in `src/optimizer/types.ts` is the authoritative row count. Column count is per-mount data (`MOUNTS[mountKey].cols`) and is threaded through the optimizer as a `cols` parameter — do not hardcode `7`/`8`/`9`/`12` and do not assume a single board width.

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

- **Stats (8):** `critDamage`, `skillDamage`, `shieldDamage`, `toWeakened`, `toPoisoned`, `toChilled`, `laceration`, `toBosses` — defined in `src/data/types.ts`, display metadata in `src/data/stats.ts`. All values are percentages (e.g. `15` means +15%). `ScoreStatKey` additionally includes `vulnerability`, an optional player/mount-only field in `StatTotals` for backward compatibility. `STATS`, `STAT_KEYS`, `STAT_META` and `BUFF_TABLE` remain restricted to real component types. `SCORE_STATS`, `SCORE_STAT_KEYS` and `SCORE_STAT_META` include Vulnerability for inputs, scoring and summary rows. Never offer Vulnerability pieces. Legacy missing Vulnerability means zero.
- **Shapes (5):** `O`, `I`, `T`, `L`, `J`. S- and Z-tetrominoes do **not** exist. Rotation tables in `src/data/shapes.ts` are pre-normalized (min row/col = 0) and deduplicated at module load: `O` has 1 rotation, `I` has 2, `T`/`L`/`J` each have 4. A `Placement`'s `rotation` field indexes into `SHAPE_ROTATIONS[shape]`.
- **Quality tiers (7):** `good`, `better`, `excellent`, `excellentPlus`, `epic`, `epicPlus`, `legend` — defined in `src/data/types.ts`. Buff magnitudes are `BUFF_TABLE[quality][stat]` in `src/data/buffTable.ts`.
- **Piece:** `{ id, shape, quality, stat }`. Its buff value is `BUFF_TABLE[piece.quality][piece.stat]`.
- **Mounts (5):** `electricScooter` (8×7), `techHoverboard` (8×9), `doomsteed` (8×12), `netherflameStalker` (8×12), `ruinWarskitter` (8×12) — defined in `src/data/mounts.ts` (`MOUNTS` is the single source of truth: name, icon, bg color, board cols, line-bonus tiers, **per-level sync-rate table**). Use `MountKey` and `MOUNTS[key]` everywhere; never hardcode mount metadata. `netherflameStalker` reuses Doomsteed's board width, sync-rate table, and `bgColor`; its line-bonus tiers are distinct and it is the only mount whose no-bonus line is 4 (an explicit `bonus: {}` tier) rather than 2 — the others omit their 2-line tier entirely. An empty-`bonus` tier is inert in `applyLineBonuses` (adds 0), so it behaves like an absent tier for scoring; it only nudges `maxBonusLinesForLevel` up by one at levels 0–1, which is harmless (matches Electric Scooter/Tech Hoverboard's value there anyway). Ruinous Warskitter retains the stable `ruinWarskitter` key for save/export compatibility. Its original game WebP and the Vulnerability WebP are bundled locally from Expo's CDN; source URLs and hashes are recorded in `docs/notes/ruinous-warskitter-exp0-audit.md`. Expo's deployed calculator confirms shared Legendary shard/core costs. Its 2026-11-21 update sets shared Legendary sync rates from 60% at zero stars to 200% at four red stars. All tiers match the user's complete description and Expo's totals for two or more completed rows. A row-0 tier models the equipped base +30 Vulnerability. Expo stores this under row 2 and assumes all star-unlocked rows; retain our base tier because the skill grants the effect independently of rows. Row 1 grants +10 shield/+40 chilled; row 2 extends Vulnerability duration by 5s (no magnitude change under the maintained-debuff assumption); row 3 grants +15 shield/+15 boss; row 4 grants +100 Vulnerability at five Enhancement stacks after 250 shots; row 5 at level 2 grants +60 shield (maximum six Shield stacks); row 6 at level 4 grants +20 shield/+60 chilled; row 7 at level 6 grants +35 shield/+25 boss; row 8 at level 8 adds +100 Vulnerability (another +20 per Enhancement stack). Cumulative Vulnerability is 130 at four rows and 230 at eight, including the base 30 exactly once. No TBA flag remains. `lineBonusNotes` reports maintained-debuff and maximum-stack assumptions, plus the exclusion of direct mount attack damage. Expo also excludes Ruin's direct attacks pending calibration. Synced mounts receive none of these base/line effects.
- **Mount level (`MountLevel`, 0–8):** in `src/data/lineBonuses.ts`. Each line-bonus tier has an `unlockedAtLevel` gate; tiers above the player's current level are silently skipped. Levels persist **per mount** (each mount tracks its own stars).
- **Sync rate:** Non-equipped mounts grant `syncRates[level]%` of each piece's full buff, which can exceed 100%. Per-mount table indexed by `MountLevel` (0..8) — values are absolute percentages, not cumulative. Helper: `syncRateFor(key, level)` in `src/data/mounts.ts`. The equipped mount always grants 100%.

### Damage formula (`src/optimizer/scoring.ts`)

```
score =
    (1 + critDamage/100)
  * (1 + skillDamage/100)
  * (1 + shieldDamage/100)
  * (1 + laceration/100)
  * (1 + toBosses/100)
  * (1 + vulnerability/100)
  * (1 + (toWeakened + toPoisoned + toChilled)/100)
```

The three debuff-conditional stats (weakened / poisoned / chilled) sum **inside a single `(1 + x/100)` factor** — they compete additively with each other, while the other six each get their own multiplicative factor. Vulnerability from gear and the equipped mount adds before its factor is applied. Missing legacy Vulnerability defaults to zero.

**Elemental preference:** when damage scores tie, prefer elemental components matching the player's highest starting elemental stat, using same-shape, same-quality alternatives from the inventory. Rank all three starting elemental stats descending; tied starting values fall back to `toChilled`, `toPoisoned`, `toWeakened`. `debuffPriorityFor` in `src/data/stats.ts` is the source of truth. Freeze the order for the entire multi-board run so earlier boards cannot change the preference. Greedy ranking, selection, and allocation refinement use it; refinement permits score-neutral equal-grade elemental exchanges to place the preferred element on higher-sync boards or replace unused alternatives. Higher damage scores still win, including Doomsteed poison thresholds. This preference does not model elemental debuff penalties.

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
- **Adding a legal piece increases the score for a fixed layout**, but changing shape mixes can trade piece buffs against line bonuses. The solver only tries near-full mixes (G, G-1, G-2), or K/K-1 for small inventories; these are heuristic restrictions, not proofs.
- **Multi-mount allocation must be judged jointly.** Sequential single-board optima can be suboptimal in aggregate because synced contributions change marginal values. The solver uses sequential boards as a starting point, then tests transfers to higher-sync gaps and same-shape swaps across boards and unused inventory.
- **Full-board (size-G) tilings are exact cover.** MRV and checkerboard T-parity speed up geometry, but budget exhaustion is not a proof of infeasibility. `searchTiling` returns `{ result, complete, stopReason }`. Cache only complete results.

## Architecture

### Optimizer core (`src/optimizer/`)

A single fast heuristic search is followed by cross-mount refinement. There is no search-mode checkbox or production exhaustive solver. Never describe heuristic completion as proven optimality.

For a fixed piece selection, geometry depends only on its shape distribution and only completed rows affect line bonuses. This permits separate tiling and allocation searches. Monotonicity alone does not prove that sequential mount allocation or only near-full distributions suffice.

- `types.ts` — `Placement`, `OptimizerInput` (carries `mountConfigs: MountConfig[]` — every unlocked mount, exactly one with `isEquipped: true`), `BoardSolveResult` (single-board internal type returned by `solve()`), `BoardResult` (per-mount slice of the user-facing aggregate), `OptimizerResult` (multi-mount aggregate with `boards: BoardResult[]`, `equippedMountKey`, aggregate `afterScore`), `BOARD_ROWS` (= 8). There is **no `BOARD_COLS`** — column count is per-mount and threaded as a `cols` argument
- `board.ts` — bitboard using `BigInt` (`bit = row*cols + col`). All board ops are parameterized by `cols`: `boardBits(cols)`, `fullRowMasks(cols)`, `fullBoard(cols)`, `bitFor(row, col, cols)`, `countFullRows(occ, cols)`, `placementsForShape(shape, cols)`, `occupancyTo2D(occ, cols)`. Row masks, full-board masks, and per-shape placement tables are cached keyed on `cols`
- `scoring.ts` — `formula()`, `applyLineBonuses(stats, lines, tiers, mountLevel)`, `scoreLayout(currentStats, picks, lines, tiers, mountLevel, pieceBuffMultiplier?)` (the canonical scoring entry point), `finalizeStats(...)`, `addPieceBuffs(stats, pieces, multiplier?)`. The `pieceBuffMultiplier` (default 1) scales every piece's contribution before adding — sync-rate scaling lives here, **not** in a separate code path. **Single-board tiers are passed in.** `evaluateBoards` is the canonical complete-allocation scorer: equipped dynamic bonuses use pre-mount + equipped pieces + earlier equipped tiers, then synced boards add their buffs.
- `tiling.ts` — MRV exact-cover search on BigInt masks, parameterized by board width. `tileDistribution` remains a compatibility wrapper; `searchTiling` returns completion metadata. Tiling has a 200,000-node budget and respects deadlines and cancellation checks. A null result is a proof of infeasibility only when `complete` is true.
- `greedy.ts` — `createGreedyEstimator(...)`: fast per-mix selection estimate. Per (shape, stat) the best-quality piece is always taken first (higher quality strictly dominates within a stat); each step adds the head piece that raises the formula most against the *running* stats (diminishing returns recomputed), then a 1-swap local search fixes weak picks. Observed worst case ~1% under the exact selection (`greedy.test.ts`); `pick()` also returns the concrete pieces, used to seed `selectPieces`. Never a bound — callers keep a slack factor.
- `selection.ts` — bucketed selection DFS for one shape mix. Scores dynamic line tiers after the chosen piece buffs, re-scores greedy seeds using the actual objective, and uses a conservative dynamic-tier bound. Node-capped searches return `complete: false`.
- `solve.ts` — single-board solver. Looks up the mount via `MOUNTS[mountKey]` at entry, derives `cols`, `tiers`, `boardBits`, `geometricMaxPieces` per call, threads them through. Accepts `pieceBuffMultiplier` (default 1) and `disableLineBonuses` (when true, internally sets `tiers = []` regardless of mount level — used by `solveAll` for non-equipped boards). Two regimes:
  - K < G (inventory smaller than geometric max): tile the entire inventory. If it doesn't tile *or* tiles short of the line target, also try every drop-one-piece mix (tiled once per shape) and keep the best score — a line bonus can outweigh one dropped piece. Only one piece is dropped; deeper drops aren't searched
  - K ≥ G: rank G/G-1/G-2 distributions by a greedy estimate, tile, and refine selection (2,000 nodes by default). Estimated-gain and patience stopping are heuristics. Neither a 1% tolerance nor zero tolerance certifies an optimum. Incomplete tilings are not cached as infeasible.
- `solveAll.ts` — validates exactly one equipped mount and unique mount keys. Solves equipped first, other mounts by descending sync rate, then runs `refineAllocation`. When inventory runs out, append empty results for all remaining requested mounts, preserving their levels and sync rates. These boards have zero contributions and `stopReason: 'completed'`, with `truncated: false`; no search is needed for them. The time limit is per board, followed by a short refinement pass. `BoardResult.buffsFromPieces` is always unscaled. Mount previews show a piece count or **Empty board**, and empty boards remain selectable.
- `refine.ts` — tries score-improving moves into legal gaps on boards above 100% sync, then repeatedly finds the best same-shape exchange across any two boards or with unused inventory. Geometry stays valid. This is local improvement, not a global certificate.
- `worker.ts` — DedicatedWorker entry; forwards messages to `solveAll()`, emits `progress` (with `currentMountKey`) and `done` messages

### UI + state (`src/components/`, `src/App.tsx`, `src/hooks/`)

- `useOptimizer` owns a long-lived Worker, dispatches `run()` / `cancel()`, maintains `{ running, result, error, progress }`. Progress events include `currentMountKey` so the UI can show which board is currently being optimized. The worker is terminated on unmount.
- `usePersistedState` is a `useState`-shaped wrapper around `localStorage`. Versioned keys: `mount-opt:current-stats:v1`, `mount-opt:pieces:v1`, `mount-opt:selected-mount:v1`, `mount-opt:mount-levels:v1` (one entry per mount), `mount-opt:unlocked-mounts:v1` (per-mount boolean), `mount-opt:optimize-scope:v1` (`'allUnlocked'` or `'equippedOnly'`), `mount-opt:full-time-limit:v1`, `mount-opt:profiles:v1`. The legacy `mount-opt:mount-level:v1` key is migrated on read into `mountLevels.electricScooter` and otherwise ignored. New users default to **only the previously-selected mount being unlocked** so the legacy single-mount UI is preserved until the user explicitly unlocks more. Pre-Netherflame three-key and pre-Ruin four-key level/unlock maps are expanded by `legacySeededMountLevels` / `legacySeededUnlocked`, preserving existing values and defaulting new mounts to level 0, locked. Current five-key maps are returned intact. Migrated maps are written back for the current validators. **Gotcha:** the persisted `unlocked-mounts` value is a **boolean** map, so its migration checks for booleans (`isLegacyBooleanUnlockedMap`) — distinct from the export-string form, which is 1/0 and checked by `isLegacyUnlockedMap`; don't cross the two or existing users' unlocks silently reset.
- `MountPanel` is the five-mount picker (lock toggle + icon + per-mount stars + sync-rate readout), laid out `grid-cols-2 sm:grid-cols-3` (2 columns on mobile, 3 on wider screens). The lock toggle on the last-unlocked mount is disabled (≥1 must always be unlocked). Locking the equipped mount auto-switches the equipped to the first remaining unlocked mount (handled in `App.handleUnlockedChange`). Locked mounts can't be selected as equipped (button disabled). Ruinous uses the original game artwork from Expo's CDN and all its bonuses are implemented.
- `OptimizerPanel` exposes a scope toggle (`'allUnlocked'` vs `'equippedOnly'`) **only when 2+ mounts are unlocked**. With one unlocked or `equippedOnly`, only the equipped mount is in `mountConfigs` and the result has a single board.
- **Result section:** when `result.boards.length > 1`, a row of `MountBoardPreview` thumbnails sits below the main `BoardView`, with the active one outlined; clicking switches `displayedMountKey`. The header score is the **aggregate** (`result.afterScore` / `result.beforeScore`), already computed across every board by `solveAll`. The main board view label includes `(equipped)` for the equipped mount. `StatsSummary` accepts `tabs` + `activeTabId`: the All-mounts tab sums sync-scaled piece contributions and shows equipped-only line bonuses; per-mount equipped tab matches today's view; per-mount non-equipped replaces the `+ Lines` column with `(× X% sync rate)` showing pieces × syncRate in dimmed blue. All-mounts and non-equipped tabs round contributions to 0.01. When the final (non-running) result has any board that is `truncated` **and** has zero placements, `App` renders an amber warning naming those mounts and prompting the user to raise/disable the time limit — this is the "time limit too low to find any layout" case (distinct from a board that's empty because there were no pieces left for it). Results show Best found; stop reasons distinguish heuristic/node/time limits and cancellation. Progress phases are boards/refining. When the result's equipped mount has `lineBonusesPending`, label its score and line contributions TBA and totals as known values. This uses the frozen result mount, not the live picker selection. Gate `lineBonusNotes` against the equipped result board's actual rows and level, so unselected or synced mounts never show irrelevant assumptions. Synced Ruinous boards have known piece contributions and no line bonuses, as with other synced mounts.
- **Result inventory is frozen at run start.** `App` captures a copy of each piece before posting the run. Board rendering, mount previews, and the result's unused-piece list use that snapshot, so later edits cannot change shapes or buffs inside old placements. `isResultStale` checks membership and each piece's shape, quality and stat against the snapshot, including unused pieces; sorting alone remains fresh. Stale results are dimmed and ask the user to rerun. Live inventory summaries, single-piece edits, bulk Apply, saves and exports share the current `pieces` state. Bulk drafts only commit on Apply. Mount changes do not re-derive placements or scores.
- **Export format:** strings are prefixed `mount-opt:vN:`. Current is **v10**, storing five-key `lv` and `u` maps including Ruin plus a required non-negative `vu` for pre-mount Vulnerability. Keep the existing `s` array in its frozen eight-component-stat order. v1–v9 remain supported with Vulnerability defaulting to zero; v1–v8 default Ruin to locked at level 0, and pre-v7 also defaults Netherflame to locked. v8's retired `g` flag is validated and ignored. Current encoders iterate `MOUNT_KEYS`; legacy v7/v8 decoders use the frozen four-key schema. Equipped mounts are force-unlocked on modern imports. Serialization, validation and localStorage migrations live in `src/utils/config.ts`.
- `OptimizerResult` and `BoardResult` are fully serializable (no BigInts) so they cross the worker boundary cleanly. Don't put `bigint` in any worker-bound type.

### TypeScript config notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` and `erasableSyntaxOnly: true`. This means:

- Use `import type { ... }` for type-only imports (a plain `import` of a type will fail to build).
- Enums and namespaces are disallowed — use union string literal types (`type Foo = 'a' | 'b'`).

`vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`) so the `test` block is typed.
