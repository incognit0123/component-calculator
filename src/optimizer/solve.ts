import {
  maxBonusLinesForLevel,
  type LineBonusTier,
  type MountLevel,
} from '../data/lineBonuses'
import { DEFAULT_MOUNT_KEY, MOUNTS, type MountKey } from '../data/mounts'
import { MIN_PIECE_CELLS, SHAPE_KEYS } from '../data/shapes'
import { zeroStats } from '../data/stats'
import type { Piece, ShapeKey, StatTotals } from '../data/types'
import { boardBits } from './board'
import { createGreedyEstimator } from './greedy'
import { selectPieces } from './selection'
import {
  finalizeStats,
  formula,
  scoreLayout,
} from './scoring'
import {
  enumerateDistributions,
  inventoryShapeCounts,
  tileDistribution,
  totalShapeCells,
  type ShapeCounts,
  type SlotPlacement,
  type TilingResult,
} from './tiling'
import { BOARD_ROWS } from './types'
import type { BoardSolveResult, Placement } from './types'

export interface SolveOptions {
  mountKey?: MountKey
  mountLevel?: MountLevel
  isCancelled?: () => boolean
  /**
   * Called as the solver makes progress. `fractionComplete` is in [0, 1] and
   * tracks how much of this board's distribution queue has been processed
   * (either fully evaluated or pruned). In the K<G regime it stays at 0 until
   * completion and is then implicitly 1 when the solver returns.
   */
  onProgress?: (
    best: BoardSolveResult,
    explored: number,
    fractionComplete: number,
  ) => void
  /** Hard time cap (ms). On expiry returns best-so-far with truncated=true. */
  timeBudgetMs?: number
  /**
   * Multiplier applied to every piece's buff value during optimization and
   * scoring. Default 1 (full buffs, equipped mount). Pass syncRate/100 when
   * solving a non-equipped mount's board so the search optimizes against the
   * already-discounted contribution.
   */
  pieceBuffMultiplier?: number
  /**
   * When true, skip line-clear bonuses entirely regardless of `mountLevel`.
   * Set this for non-equipped mounts (which don't grant line bonuses).
   */
  disableLineBonuses?: boolean
  /**
   * Stop once no remaining candidate can beat the best layout by more than
   * this fraction (default 0.01 = result is provably within 1% of optimal).
   * Pass 0 for an exhaustive proof of optimality.
   */
  optimalityTolerance?: number
  /** DFS node cap for refining one mix's piece selection (default 2000). */
  selectionNodeBudget?: number
  /**
   * Stop after this many evaluated mixes in a row that don't beat the best by
   * more than `optimalityTolerance` (of the gain). Default 100.
   */
  patience?: number
}

const YIELD_INTERVAL_MS = 8
const PROGRESS_INTERVAL_MS = 400
/**
 * How many fewer pieces than the geometric maximum to consider in K≥G mode.
 * 0/1 covered by monotonicity (adding a piece always helps); 2 added so
 * shape-distribution mismatches against inventory can fall back further.
 */
const NEAR_FULL_DEPTH = 2
/**
 * The greedy estimate can undershoot the exact selection (observed worst case
 * ~1% of the board's gain, see greedy.test.ts). The stop rule inflates each
 * estimate's *gain* by this factor so a mix whose true gain is higher than its
 * estimate isn't skipped. Measured against the gain, not the total score, so it
 * keeps its meaning as running stats grow and pieces count for less (low sync
 * rate): a fixed percentage of the whole score would swallow every candidate.
 */
const GAIN_SLACK = 1.02
/** Default number of non-improving evaluated mixes before giving up. */
const DEFAULT_PATIENCE = 100
/** DFS node cap for the exact selection refinement of one mix. */
const SELECTION_NODE_BUDGET = 2_000

/**
 * Top-level optimizer.
 *
 * Two regimes based on inventory size K vs the geometric piece-cap G:
 *
 * - K < G: tile all inventory pieces (selection is fixed). If the inventory's
 *   shape mix can't tile, fall back to dropping one piece (try each removal).
 *
 * - K ≥ G: enumerate shape-distributions of size G, G-1, G-2 that fit within
 *   inventory shape counts. Rank by an admissible upper bound on score; for
 *   each distribution in rank order, find a tiling and optimize the piece
 *   selection. Prune distributions whose upper bound can't beat the current
 *   best.
 */
export async function solve(
  inventory: Piece[],
  currentStats: StatTotals,
  opts: SolveOptions = {},
): Promise<BoardSolveResult> {
  const started = performance.now()
  const mountKey: MountKey = opts.mountKey ?? DEFAULT_MOUNT_KEY
  const mount = MOUNTS[mountKey]
  const cols = mount.cols
  // Non-equipped mounts don't grant line bonuses — pass an empty tier list to
  // every downstream consumer rather than threading a separate flag, so a
  // single code path covers both regimes.
  const tiers: LineBonusTier[] = opts.disableLineBonuses
    ? []
    : mount.lineBonusTiers
  const mountLevel: MountLevel = opts.mountLevel ?? 0
  const pieceBuffMultiplier = opts.pieceBuffMultiplier ?? 1
  const deadline =
    opts.timeBudgetMs != null ? started + opts.timeBudgetMs : Infinity

  const totalCells = boardBits(cols)
  const geometricMaxPieces = Math.floor(totalCells / MIN_PIECE_CELLS)

  const ctx: SolveContext = {
    inventory,
    currentStats,
    mountKey,
    cols,
    tiers,
    mountLevel,
    pieceBuffMultiplier,
    optimalityTolerance: opts.optimalityTolerance ?? 0.01,
    selectionNodeBudget: opts.selectionNodeBudget ?? SELECTION_NODE_BUDGET,
    patience: opts.patience ?? DEFAULT_PATIENCE,
    maxBonusLines: maxBonusLinesForLevel(mountLevel, tiers),
    geometricMaxPieces,
    totalCells,
    deadline,
    started,
    isCancelled: opts.isCancelled,
    onProgress: opts.onProgress,
    explored: 0,
    cancelled: false,
    truncated: false,
    lastYield: started,
    // Back-date so the first improvement bypasses the throttle and always
    // reaches the UI as a preliminary result, even if it's found early.
    lastProgress: started - PROGRESS_INTERVAL_MS,
    distTotal: 0,
    distProcessed: 0,
    latestBest: null,
  }

  const result =
    inventory.length < geometricMaxPieces
      ? await solveSmallInventory(ctx)
      : await solveFullInventory(ctx)
  result.elapsedMs = performance.now() - started
  result.truncated = ctx.truncated
  return result
}

interface SolveContext {
  inventory: Piece[]
  currentStats: StatTotals
  mountKey: MountKey
  cols: number
  tiers: LineBonusTier[]
  mountLevel: MountLevel
  pieceBuffMultiplier: number
  optimalityTolerance: number
  selectionNodeBudget: number
  patience: number
  maxBonusLines: number
  geometricMaxPieces: number
  totalCells: number
  deadline: number
  started: number
  isCancelled?: () => boolean
  onProgress?: (
    best: BoardSolveResult,
    explored: number,
    fractionComplete: number,
  ) => void
  explored: number
  cancelled: boolean
  truncated: boolean
  lastYield: number
  lastProgress: number
  /** Distributions queued for evaluation in the K≥G regime. 0 in the K<G regime. */
  distTotal: number
  /** Distributions processed (evaluated or pruned) so far. */
  distProcessed: number
  /** Latest best-so-far snapshot (kept so periodic progress can emit without a fresh improvement). */
  latestBest: BoardSolveResult | null
}

/**
 * K < G regime: try to tile the entire inventory. Selection is trivial.
 * Falls back to all-but-one-piece tilings only if the full-inventory shape
 * mix can't be packed — adding any piece strictly improves score, so the
 * largest tileable subset always wins.
 */
async function solveSmallInventory(ctx: SolveContext): Promise<BoardSolveResult> {
  const fullDist = inventoryShapeCounts(ctx.inventory)
  const target = effectiveLineTarget(
    totalShapeCells(fullDist),
    ctx.maxBonusLines,
    ctx.cols,
  )
  const tiling = tileDistribution(fullDist, ctx.cols, target, {
    deadline: ctx.deadline,
  })
  if (tiling) {
    return buildResult(
      ctx,
      ctx.inventory,
      tiling.slots,
      tiling.lines,
    )
  }

  let best: BoardSolveResult | null = null
  let bestScore = formula(ctx.currentStats)
  for (let i = 0; i < ctx.inventory.length; i++) {
    if (await maybeYield(ctx)) break
    const dropped = ctx.inventory.filter((_, j) => j !== i)
    const droppedDist = inventoryShapeCounts(dropped)
    const droppedTiling = tileDistribution(
      droppedDist,
      ctx.cols,
      effectiveLineTarget(totalShapeCells(droppedDist), ctx.maxBonusLines, ctx.cols),
      { deadline: ctx.deadline },
    )
    if (!droppedTiling) continue
    const result = buildResult(
      ctx,
      dropped,
      droppedTiling.slots,
      droppedTiling.lines,
    )
    if (result.afterScore > bestScore) {
      bestScore = result.afterScore
      best = result
    }
  }

  return best ?? emptyResult(ctx)
}

async function solveFullInventory(
  ctx: SolveContext,
): Promise<BoardSolveResult> {
  const invCounts = inventoryShapeCounts(ctx.inventory)
  const distributions: ShapeCounts[] = []
  for (let off = 0; off <= NEAR_FULL_DEPTH; off++) {
    const size = ctx.geometricMaxPieces - off
    if (size < 0) break
    for (const dist of enumerateDistributions(invCounts, size)) {
      if (totalShapeCells(dist) > ctx.totalCells) continue
      distributions.push(dist)
    }
  }

  // Greedy-ranked best-first search.
  //
  // Tiling (~100ms per shape mix on the widest board) dwarfs everything else,
  // and the admissible per-shape ratio bound is far too loose to prune with
  // (it ignores that slots compete for the same stats). So rank mixes by a
  // fast greedy estimate of their best selection (microseconds each), tile in
  // that order, and run the exact selection only on mixes that tile. Stop once
  // no remaining mix is estimated to beat the best layout by more than the
  // optimality tolerance. Ranking is by estimate, so the guarantee is
  // "within ~tolerance" rather than a proof, which is the intended trade-off.
  const estimator = createGreedyEstimator(
    ctx.inventory,
    ctx.currentStats,
    ctx.tiers,
    ctx.mountLevel,
    ctx.pieceBuffMultiplier,
  )
  const queue: QueueEntry[] = distributions.map((dist) => ({
    dist,
    ub: estimator.estimate(
      dist,
      effectiveLineTarget(totalShapeCells(dist), ctx.maxBonusLines, ctx.cols),
    ),
  }))
  queue.sort((a, b) => b.ub - a.ub)

  ctx.distTotal = queue.length
  ctx.distProcessed = 0

  let best: BoardSolveResult | null = null
  // Everything below is judged on the improvement over this board's starting
  // score, so the tolerance scales with how much the pieces can actually add.
  const startScore = formula(ctx.currentStats)
  let bestScore = startScore
  const threshold = 1 + ctx.optimalityTolerance
  /** Evaluated mixes in a row that failed to meaningfully beat the best. */
  let sinceImprovement = 0

  for (const entry of queue) {
    if (await maybeYield(ctx)) break

    // Sorted descending: nothing after this can beat the best gain (within
    // tolerance), so count the rest as processed and stop.
    if (
      (entry.ub - startScore) * GAIN_SLACK <=
      (bestScore - startScore) * threshold
    ) {
      ctx.distProcessed = ctx.distTotal
      maybeProgress(ctx)
      break
    }

    const target = effectiveLineTarget(
      totalShapeCells(entry.dist),
      ctx.maxBonusLines,
      ctx.cols,
    )

    ctx.distProcessed++
    const tiling = cachedTile(ctx, entry.dist, target)
    if (!tiling) {
      maybeProgress(ctx)
      continue
    }

    // Start the exact search from the greedy answer and cap its effort: it can
    // only improve on the seed, so the cost is bounded and quality never drops.
    const seed = estimator.pick(entry.dist, tiling.lines)
    const selection = selectPieces(
      ctx.inventory,
      entry.dist,
      tiling.lines,
      ctx.currentStats,
      ctx.tiers,
      ctx.mountLevel,
      ctx.pieceBuffMultiplier,
      { seed, nodeBudget: ctx.selectionNodeBudget },
    )
    ctx.explored++

    if (selection.score > bestScore) {
      // "Meaningful" = beats the best gain by more than the tolerance. Smaller
      // wins are still kept, but don't reset the patience counter.
      const meaningful =
        selection.score - startScore >
        (bestScore - startScore) * threshold
      bestScore = selection.score
      best = buildResult(ctx, selection.picks, tiling.slots, tiling.lines)
      ctx.latestBest = best
      if (meaningful) sinceImprovement = 0
      else sinceImprovement++
    } else {
      sinceImprovement++
    }
    // Patience stop. On later boards the leftover pieces are weak and similar,
    // so huge numbers of mixes score within any fixed margin of the best and the
    // bound alone can't prune them. Mixes are tried best-first, so a long run
    // of evaluated mixes without a meaningful gain means the rest won't matter.
    if (sinceImprovement >= ctx.patience) {
      ctx.distProcessed = ctx.distTotal
      maybeProgress(ctx)
      break
    }
    maybeProgress(ctx)
  }

  return best ?? emptyResult(ctx)
}

interface QueueEntry {
  dist: ShapeCounts
  /** Greedy estimate of the best score for this mix at its line target. */
  ub: number
}

/**
 * Tiling depends only on (cols, shape mix, line target), not on pieces or
 * stats, so results are reusable across boards and re-runs. Aborted searches
 * (deadline hit) are not cached since a null there means "gave up".
 */
const tilingCache = new Map<string, TilingResult | null>()

function cachedTile(
  ctx: SolveContext,
  dist: ShapeCounts,
  target: number,
): TilingResult | null {
  const key = `${ctx.cols}|${target}|${SHAPE_KEYS.map((s) => dist[s]).join(',')}`
  const hit = tilingCache.get(key)
  if (hit !== undefined) return hit
  const result = tileDistribution(dist, ctx.cols, target, {
    deadline: ctx.deadline,
  })
  if (performance.now() < ctx.deadline) tilingCache.set(key, result)
  return result
}

/**
 * Highest line count worth searching for given the cells we'll place. Capped
 * by both the geometric ceiling (cells / cols) and the level-dependent bonus
 * cap, since extra lines beyond the cap don't change the score.
 */
function effectiveLineTarget(
  cellsToPlace: number,
  maxBonusLines: number,
  cols: number,
): number {
  const totalCells = BOARD_ROWS * cols
  const emptyCells = Math.max(0, totalCells - cellsToPlace)
  const geometricMax = Math.max(
    0,
    BOARD_ROWS - Math.ceil(emptyCells / cols),
  )
  return Math.min(maxBonusLines, geometricMax)
}

function assignPiecesToSlots(
  picks: Piece[],
  slots: SlotPlacement[],
): Placement[] {
  const byShape: Record<ShapeKey, Piece[]> = {} as Record<ShapeKey, Piece[]>
  for (const s of SHAPE_KEYS) byShape[s] = []
  for (const p of picks) byShape[p.shape].push(p)
  const out: Placement[] = []
  for (const slot of slots) {
    const piece = byShape[slot.shape].shift()
    if (!piece) {
      throw new Error(
        `assignPiecesToSlots: no piece available for shape ${slot.shape}`,
      )
    }
    out.push({
      pieceId: piece.id,
      rotation: slot.rotation,
      row: slot.row,
      col: slot.col,
    })
  }
  return out
}

function buildResult(
  ctx: SolveContext,
  picks: Piece[],
  slots: SlotPlacement[],
  lines: number,
): BoardSolveResult {
  const placements = assignPiecesToSlots(picks, slots)
  const beforeScore = formula(ctx.currentStats)
  const afterScore = scoreLayout(
    ctx.currentStats,
    picks,
    lines,
    ctx.tiers,
    ctx.mountLevel,
    ctx.pieceBuffMultiplier,
  )
  const { buffsFromPieces, buffsFromLines } = finalizeStats(
    ctx.currentStats,
    picks,
    lines,
    ctx.tiers,
    ctx.mountLevel,
    ctx.pieceBuffMultiplier,
  )
  const placedIds = new Set(picks.map((p) => p.id))
  const unusedPieceIds = ctx.inventory
    .filter((p) => !placedIds.has(p.id))
    .map((p) => p.id)
  return {
    placements,
    unusedPieceIds,
    beforeScore,
    afterScore,
    buffsFromPieces,
    buffsFromLines,
    linesFilled: lines,
    elapsedMs: 0,
    mountKey: ctx.mountKey,
    truncated: false,
  }
}

function emptyResult(ctx: SolveContext): BoardSolveResult {
  const score = formula(ctx.currentStats)
  return {
    placements: [],
    unusedPieceIds: ctx.inventory.map((p) => p.id),
    beforeScore: score,
    afterScore: score,
    buffsFromPieces: zeroStats(),
    buffsFromLines: zeroStats(),
    linesFilled: 0,
    elapsedMs: 0,
    mountKey: ctx.mountKey,
    truncated: false,
  }
}

/**
 * Yield to the event loop periodically so the worker can receive cancel
 * messages. Sets ctx.cancelled / ctx.truncated as side effects. Returns true
 * if the caller should stop iterating.
 */
async function maybeYield(ctx: SolveContext): Promise<boolean> {
  const now = performance.now()
  if (now - ctx.lastYield < YIELD_INTERVAL_MS) {
    return ctx.cancelled
  }
  await new Promise<void>((r) => setTimeout(r, 0))
  ctx.lastYield = performance.now()
  if (ctx.isCancelled?.()) ctx.cancelled = true
  if (performance.now() > ctx.deadline) {
    ctx.cancelled = true
    ctx.truncated = true
  }
  return ctx.cancelled
}

function maybeProgress(ctx: SolveContext): void {
  if (!ctx.onProgress) return
  const now = performance.now()
  if (now - ctx.lastProgress < PROGRESS_INTERVAL_MS) return
  ctx.lastProgress = now
  const fraction =
    ctx.distTotal > 0 ? Math.min(1, ctx.distProcessed / ctx.distTotal) : 0
  // If no best-so-far exists yet (no improvement has been found), synthesize a
  // baseline result so the orchestrator still has something to forward — the
  // fraction signal is the load-bearing field for the progress bar anyway.
  const best = ctx.latestBest ?? emptyResult(ctx)
  ctx.onProgress(best, ctx.explored, fraction)
}
