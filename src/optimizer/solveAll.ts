import { syncRateFor, type MountKey } from '../data/mounts'
import { STAT_KEYS, zeroStats } from '../data/stats'
import type { Piece, StatKey, StatTotals } from '../data/types'
import { addPieceBuffs, cloneStats, formula } from './scoring'
import { solve } from './solve'
import type {
  BoardResult,
  BoardSolveResult,
  MountConfig,
  OptimizerResult,
} from './types'

export interface SolveAllOptions {
  isCancelled?: () => boolean
  /**
   * Reports best-so-far across the orchestration. `currentMountKey` is the
   * mount being optimized at the moment progress was emitted.
   * `fractionComplete` is the per-board fraction (resets per board, not the
   * aggregate across the whole run); `boardIndex` is 1-based.
   */
  onProgress?: (
    best: OptimizerResult,
    explored: number,
    currentMountKey: MountKey,
    fractionComplete: number,
    boardIndex: number,
    boardCount: number,
  ) => void
  /**
   * Per-board time budget. Each board's `solve()` gets this same budget
   * fresh — if board 1 truncates, the leftover pieces are still optimized
   * against board 2 with another full `timeBudgetMs`, and so on.
   */
  timeBudgetMs?: number
}

/**
 * Multi-board optimizer.
 *
 * Pieces placed on a non-equipped mount's board only contribute (syncRate)%
 * of their full buff and grant no line bonuses, so it's strictly better to
 * fill the equipped board first with the most-valuable pieces, then the
 * highest-sync-rate non-equipped mount with the leftover, and so on. Each
 * board is solved independently with the running stats from prior boards.
 *
 * `mountConfigs` must contain exactly one entry with `isEquipped: true`. The
 * order of `mountConfigs` is irrelevant — this function decides the
 * optimization order itself (equipped first, then non-equipped by descending
 * sync rate).
 *
 * When the player has only one unlocked mount, `mountConfigs` should contain
 * just that mount. When they want "equipped only" mode despite having
 * multiple unlocked, the caller should pass only the equipped mount.
 */
export async function solveAll(
  inventory: Piece[],
  currentStats: StatTotals,
  mountConfigs: MountConfig[],
  opts: SolveAllOptions = {},
): Promise<OptimizerResult> {
  const started = performance.now()

  const equipped = mountConfigs.find((c) => c.isEquipped)
  if (!equipped) {
    throw new Error('solveAll: mountConfigs must contain exactly one isEquipped mount')
  }

  // Equipped first, then non-equipped descending by sync rate. Stable on ties.
  const order: { config: MountConfig; syncRatePct: number }[] = [
    { config: equipped, syncRatePct: 100 },
    ...mountConfigs
      .filter((c) => !c.isEquipped)
      .map((c) => ({
        config: c,
        syncRatePct: syncRateFor(c.mountKey, c.mountLevel),
      }))
      .sort((a, b) => b.syncRatePct - a.syncRatePct),
  ]

  let runningStats = cloneStats(currentStats)
  let remainingInventory = inventory.slice()
  const boards: BoardResult[] = []
  let truncated = false

  for (let i = 0; i < order.length; i++) {
    const { config, syncRatePct } = order[i]
    const isEquipped = config.isEquipped
    const multiplier = isEquipped ? 1 : syncRatePct / 100

    if (opts.isCancelled?.()) {
      truncated = true
      break
    }

    const boardIndex = i + 1
    const boardCount = order.length

    // Emit a board-start signal so the UI's per-board bar resets to 0 and the
    // i/N indicator advances the moment the next board begins, rather than
    // sitting at the previous board's final fraction until solve's first
    // throttled emit arrives. Includes an empty placeholder for the current
    // board so the UI (which renders against status.progress.partial) always
    // sees the in-progress board in the result.
    if (opts.onProgress) {
      const placeholder: BoardResult = {
        mountKey: config.mountKey,
        mountLevel: config.mountLevel,
        isEquipped: config.isEquipped,
        syncRate: syncRatePct,
        placements: [],
        buffsFromPieces: zeroStats(),
        buffsFromLines: zeroStats(),
        linesFilled: 0,
      }
      const partial = aggregate(
        [...boards, placeholder],
        equipped.mountKey,
        currentStats,
        remainingInventory.map((p) => p.id),
        truncated,
        performance.now() - started,
      )
      opts.onProgress(
        partial,
        0,
        config.mountKey,
        0,
        boardIndex,
        boardCount,
      )
    }

    // Forward solve's progress events as a partial OptimizerResult that
    // includes already-finished boards plus the current board's best-so-far.
    const onBoardProgress = opts.onProgress
      ? (best: BoardSolveResult, explored: number, fraction: number) => {
          const partialBoard = makeBoardResult(
            best,
            config,
            syncRatePct,
            remainingInventory,
          )
          const partial = aggregate(
            [...boards, partialBoard],
            equipped.mountKey,
            currentStats,
            // Unused-after-current = current board's leftover. Subsequent
            // boards haven't run yet so we can't predict their leftover.
            best.unusedPieceIds,
            truncated,
            performance.now() - started,
          )
          opts.onProgress?.(
            partial,
            explored,
            config.mountKey,
            fraction,
            boardIndex,
            boardCount,
          )
        }
      : undefined

    const solved = await solve(remainingInventory, runningStats, {
      mountKey: config.mountKey,
      mountLevel: config.mountLevel,
      pieceBuffMultiplier: multiplier,
      disableLineBonuses: !isEquipped,
      timeBudgetMs: opts.timeBudgetMs,
      isCancelled: opts.isCancelled,
      onProgress: onBoardProgress,
    })

    if (solved.truncated) truncated = true

    boards.push(makeBoardResult(solved, config, syncRatePct, remainingInventory))

    // Roll the running stats forward: solve already accounted for the
    // multiplier in `buffsFromPieces` and computed line bonuses (zero for
    // non-equipped). We can just add both diffs onto the running stats.
    for (const k of STAT_KEYS) {
      runningStats[k] += solved.buffsFromPieces[k] + solved.buffsFromLines[k]
    }

    const placedIds = new Set(solved.placements.map((p) => p.pieceId))
    remainingInventory = remainingInventory.filter((p) => !placedIds.has(p.id))

    if (remainingInventory.length === 0) break
  }

  const beforeScore = formula(currentStats)
  const afterScore = formula(runningStats)

  return {
    equippedMountKey: equipped.mountKey,
    boards,
    unusedPieceIds: remainingInventory.map((p) => p.id),
    beforeScore,
    afterScore,
    elapsedMs: performance.now() - started,
    truncated,
  }
}

/**
 * Convert a single-board `BoardSolveResult` into the user-facing `BoardResult`
 * by recomputing `buffsFromPieces` UNSCALED (the per-mount tab in the UI shows
 * full buffs even for non-equipped mounts, scaling only at aggregation time).
 */
function makeBoardResult(
  solved: BoardSolveResult,
  config: MountConfig,
  syncRatePct: number,
  inventoryAtSolve: Piece[],
): BoardResult {
  const byId = new Map(inventoryAtSolve.map((p) => [p.id, p]))
  const picks: Piece[] = []
  for (const pl of solved.placements) {
    const piece = byId.get(pl.pieceId)
    if (piece) picks.push(piece)
  }
  const unscaledBuffs = zeroStats()
  addPieceBuffs(unscaledBuffs, picks, 1)
  return {
    mountKey: config.mountKey,
    mountLevel: config.mountLevel,
    isEquipped: config.isEquipped,
    syncRate: syncRatePct,
    placements: solved.placements,
    buffsFromPieces: unscaledBuffs,
    buffsFromLines: solved.buffsFromLines,
    linesFilled: solved.linesFilled,
  }
}

/** Aggregate a list of completed (or in-progress) boards into the user-facing result. */
function aggregate(
  boards: BoardResult[],
  equippedMountKey: MountKey,
  initialStats: StatTotals,
  unusedPieceIds: string[],
  truncated: boolean,
  elapsedMs: number,
): OptimizerResult {
  const stats = cloneStats(initialStats)
  for (const b of boards) {
    const mult = b.syncRate / 100
    for (const k of Object.keys(stats) as StatKey[]) {
      stats[k] += b.buffsFromPieces[k] * mult
    }
    for (const k of Object.keys(stats) as StatKey[]) {
      stats[k] += b.buffsFromLines[k]
    }
  }
  return {
    equippedMountKey,
    boards,
    unusedPieceIds,
    beforeScore: formula(initialStats),
    afterScore: formula(stats),
    elapsedMs,
    truncated,
  }
}

