import { BUFF_TABLE } from '../data/buffTable'
import { MAX_BONUS_LINES } from '../data/lineBonuses'
import { MIN_PIECE_CELLS, SHAPE_KEYS } from '../data/shapes'
import { zeroStats } from '../data/stats'
import type {
  OptimizerMode,
  Piece,
  ShapeKey,
  StatTotals,
} from '../data/types'
import { BOARD_BITS } from './board'
import { selectPieces } from './selection'
import {
  applyLineBonuses,
  cloneStats,
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
} from './tiling'
import { BOARD_COLS, BOARD_ROWS } from './types'
import type { OptimizerResult, Placement } from './types'

export interface SolveOptions {
  mode?: OptimizerMode
  isCancelled?: () => boolean
  onProgress?: (best: OptimizerResult, explored: number) => void
  /** Hard time cap (ms). On expiry returns best-so-far with truncated=true. */
  timeBudgetMs?: number
  /**
   * Normal mode only: skip distributions whose upper bound doesn't promise
   * a fractional improvement of at least this much over the current best.
   */
  normalToleranceEps?: number
}

const DEFAULT_NORMAL_TOLERANCE = 0.005
const YIELD_INTERVAL_MS = 8
const PROGRESS_INTERVAL_MS = 400
/**
 * How many fewer pieces than the geometric maximum to consider in K≥G mode.
 * 0/1 covered by monotonicity (adding a piece always helps); 2 added so
 * shape-distribution mismatches against inventory can fall back further.
 */
const NEAR_FULL_DEPTH = 2

const GEOMETRIC_MAX_PIECES = Math.floor(BOARD_BITS / MIN_PIECE_CELLS)

/**
 * Top-level optimizer. Replaces runFull / runNormal.
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
 *
 * Mode 'normal' adds a relative-improvement threshold so distributions whose
 * upper bound doesn't promise at least `normalToleranceEps` fractional gain
 * over the current best are skipped early.
 */
export async function solve(
  inventory: Piece[],
  currentStats: StatTotals,
  opts: SolveOptions = {},
): Promise<OptimizerResult> {
  const started = performance.now()
  const mode: OptimizerMode = opts.mode ?? 'full'
  const tolerance = opts.normalToleranceEps ?? DEFAULT_NORMAL_TOLERANCE
  const deadline =
    opts.timeBudgetMs != null ? started + opts.timeBudgetMs : Infinity

  const ctx: SolveContext = {
    inventory,
    currentStats,
    mode,
    tolerance,
    deadline,
    started,
    isCancelled: opts.isCancelled,
    onProgress: opts.onProgress,
    explored: 0,
    cancelled: false,
    truncated: false,
    lastYield: started,
    lastProgress: started,
  }

  const piecesByShape = groupPiecesByShape(inventory)
  const result =
    inventory.length < GEOMETRIC_MAX_PIECES
      ? await solveSmallInventory(ctx)
      : await solveFullInventory(ctx, piecesByShape)
  result.elapsedMs = performance.now() - started
  result.truncated = ctx.truncated
  return result
}

interface SolveContext {
  inventory: Piece[]
  currentStats: StatTotals
  mode: OptimizerMode
  tolerance: number
  deadline: number
  started: number
  isCancelled?: () => boolean
  onProgress?: (best: OptimizerResult, explored: number) => void
  explored: number
  cancelled: boolean
  truncated: boolean
  lastYield: number
  lastProgress: number
}

function groupPiecesByShape(pieces: Piece[]): Record<ShapeKey, Piece[]> {
  const out = {} as Record<ShapeKey, Piece[]>
  for (const s of SHAPE_KEYS) out[s] = []
  for (const p of pieces) out[p.shape].push(p)
  return out
}

/**
 * K < G regime: try to tile the entire inventory. Selection is trivial.
 * Falls back to all-but-one-piece tilings only if the full-inventory shape
 * mix can't be packed — adding any piece strictly improves score, so the
 * largest tileable subset always wins.
 */
async function solveSmallInventory(ctx: SolveContext): Promise<OptimizerResult> {
  const fullDist = inventoryShapeCounts(ctx.inventory)
  const target = effectiveLineTarget(totalShapeCells(fullDist))
  const tiling = tileDistribution(fullDist, target)
  if (tiling) {
    return buildResult(
      ctx.inventory,
      ctx.inventory,
      tiling.slots,
      tiling.lines,
      ctx.currentStats,
      ctx.mode,
    )
  }

  let best: OptimizerResult | null = null
  let bestScore = formula(ctx.currentStats)
  for (let i = 0; i < ctx.inventory.length; i++) {
    if (await maybeYield(ctx)) break
    const dropped = ctx.inventory.filter((_, j) => j !== i)
    const droppedDist = inventoryShapeCounts(dropped)
    const droppedTiling = tileDistribution(
      droppedDist,
      effectiveLineTarget(totalShapeCells(droppedDist)),
    )
    if (!droppedTiling) continue
    const result = buildResult(
      ctx.inventory,
      dropped,
      droppedTiling.slots,
      droppedTiling.lines,
      ctx.currentStats,
      ctx.mode,
    )
    if (result.afterScore > bestScore) {
      bestScore = result.afterScore
      best = result
    }
  }

  return best ?? emptyResult(ctx.inventory, ctx.currentStats, ctx.mode)
}

async function solveFullInventory(
  ctx: SolveContext,
  piecesByShape: Record<ShapeKey, Piece[]>,
): Promise<OptimizerResult> {
  const invCounts = inventoryShapeCounts(ctx.inventory)
  const distributions: ShapeCounts[] = []
  for (let off = 0; off <= NEAR_FULL_DEPTH; off++) {
    const size = GEOMETRIC_MAX_PIECES - off
    if (size < 0) break
    for (const dist of enumerateDistributions(invCounts, size)) {
      if (totalShapeCells(dist) > BOARD_BITS) continue
      distributions.push(dist)
    }
  }

  const ranked = distributions.map((dist) => ({
    dist,
    upperBound: distributionUpperBound(piecesByShape, dist, ctx.currentStats),
  }))
  ranked.sort((a, b) => b.upperBound - a.upperBound)

  let best: OptimizerResult | null = null
  let bestScore = formula(ctx.currentStats)

  for (const { dist, upperBound: ub } of ranked) {
    if (await maybeYield(ctx)) break

    const minImprovement = ctx.mode === 'normal' ? 1 + ctx.tolerance : 1
    if (ub <= bestScore * minImprovement) continue

    const tiling = tileDistribution(
      dist,
      effectiveLineTarget(totalShapeCells(dist)),
    )
    if (!tiling) continue

    const selection = selectPieces(
      ctx.inventory,
      dist,
      tiling.lines,
      ctx.currentStats,
    )
    ctx.explored++

    if (selection.score > bestScore) {
      bestScore = selection.score
      best = buildResult(
        ctx.inventory,
        selection.picks,
        tiling.slots,
        tiling.lines,
        ctx.currentStats,
        ctx.mode,
      )
      maybeProgress(ctx, best)
    }
  }

  return best ?? emptyResult(ctx.inventory, ctx.currentStats, ctx.mode)
}

/**
 * Optimistic upper bound on the best achievable score for `dist`. Uses the
 * line-bonus cap and per-shape multiplicative ratio bound (same admissible
 * structure as in `selection.ts`'s DFS bound, but unrolled).
 */
function distributionUpperBound(
  piecesByShape: Record<ShapeKey, Piece[]>,
  dist: ShapeCounts,
  currentStats: StatTotals,
): number {
  const cellsToPlace = totalShapeCells(dist)
  const lines = effectiveLineTarget(cellsToPlace)
  const stats = cloneStats(currentStats)
  applyLineBonuses(stats, lines)
  const baseScore = formula(stats)

  let bound = baseScore
  for (const shape of SHAPE_KEYS) {
    const slots = dist[shape]
    if (slots === 0) continue
    const pool = piecesByShape[shape]
    const ratios: number[] = []
    for (const p of pool) {
      const s = cloneStats(stats)
      s[p.stat] += BUFF_TABLE[p.quality][p.stat]
      ratios.push(formula(s) / baseScore)
    }
    ratios.sort((a, b) => b - a)
    const k = Math.min(slots, ratios.length)
    for (let i = 0; i < k; i++) bound *= ratios[i]
  }
  return bound
}

/**
 * Highest line count worth searching for given the cells we'll place. Capped
 * by both the geometric ceiling (cells / cols) and the bonus cap, since
 * extra lines beyond the cap don't change the score.
 */
function effectiveLineTarget(cellsToPlace: number): number {
  const emptyCells = Math.max(0, BOARD_BITS - cellsToPlace)
  const geometricMax = Math.max(
    0,
    BOARD_ROWS - Math.ceil(emptyCells / BOARD_COLS),
  )
  return Math.min(MAX_BONUS_LINES, geometricMax)
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
  inventory: Piece[],
  picks: Piece[],
  slots: SlotPlacement[],
  lines: number,
  currentStats: StatTotals,
  mode: OptimizerMode,
): OptimizerResult {
  const placements = assignPiecesToSlots(picks, slots)
  const beforeScore = formula(currentStats)
  const afterScore = scoreLayout(currentStats, picks, lines)
  const { buffs } = finalizeStats(currentStats, picks, lines)
  const placedIds = new Set(picks.map((p) => p.id))
  const unusedPieceIds = inventory
    .filter((p) => !placedIds.has(p.id))
    .map((p) => p.id)
  return {
    placements,
    unusedPieceIds,
    beforeScore,
    afterScore,
    buffsFromMount: buffs,
    linesFilled: lines,
    elapsedMs: 0,
    mode,
    truncated: false,
  }
}

function emptyResult(
  inventory: Piece[],
  currentStats: StatTotals,
  mode: OptimizerMode,
): OptimizerResult {
  const score = formula(currentStats)
  return {
    placements: [],
    unusedPieceIds: inventory.map((p) => p.id),
    beforeScore: score,
    afterScore: score,
    buffsFromMount: zeroStats(),
    linesFilled: 0,
    elapsedMs: 0,
    mode,
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

function maybeProgress(ctx: SolveContext, best: OptimizerResult): void {
  if (!ctx.onProgress) return
  const now = performance.now()
  if (now - ctx.lastProgress < PROGRESS_INTERVAL_MS) return
  ctx.lastProgress = now
  ctx.onProgress(best, ctx.explored)
}
