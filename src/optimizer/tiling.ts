import { SHAPE_KEYS, SHAPE_ROTATIONS } from '../data/shapes'
import type { Piece, ShapeKey } from '../data/types'
import {
  boardBits,
  countFullRows,
  fullRowMasks,
  placementsForShape,
  popcount,
} from './board'
import type { ShapePlacement } from './board'
import { BOARD_ROWS } from './types'

export type ShapeCounts = Record<ShapeKey, number>

export interface SlotPlacement {
  shape: ShapeKey
  rotation: number
  row: number
  col: number
  mask: bigint
}

export interface TilingResult {
  slots: SlotPlacement[]
  mask: bigint
  lines: number
}

/** Cells per piece, indexed by shape (constant across rotations of a shape). */
export const SHAPE_CELLS: Record<ShapeKey, number> = (() => {
  const out = {} as Record<ShapeKey, number>
  for (const shape of SHAPE_KEYS) {
    out[shape] = SHAPE_ROTATIONS[shape][0].length
  }
  return out
})()

export function emptyShapeCounts(): ShapeCounts {
  const out = {} as ShapeCounts
  for (const shape of SHAPE_KEYS) out[shape] = 0
  return out
}

export function inventoryShapeCounts(pieces: Piece[]): ShapeCounts {
  const out = emptyShapeCounts()
  for (const p of pieces) out[p.shape]++
  return out
}

export function totalShapeCells(counts: ShapeCounts): number {
  let total = 0
  for (const shape of SHAPE_KEYS) total += counts[shape] * SHAPE_CELLS[shape]
  return total
}

/**
 * All shape-count tuples summing to `totalPieces` whose per-shape counts fit
 * within `inventory`. Returned as fresh objects safe for the caller to mutate.
 */
export function enumerateDistributions(
  inventory: ShapeCounts,
  totalPieces: number,
): ShapeCounts[] {
  const out: ShapeCounts[] = []
  const accum = emptyShapeCounts()
  function recurse(shapeIdx: number, remaining: number): void {
    if (shapeIdx === SHAPE_KEYS.length) {
      if (remaining === 0) out.push({ ...accum })
      return
    }
    const shape = SHAPE_KEYS[shapeIdx]
    const max = Math.min(inventory[shape], remaining)
    for (let c = 0; c <= max; c++) {
      accum[shape] = c
      recurse(shapeIdx + 1, remaining - c)
    }
    accum[shape] = 0
  }
  recurse(0, totalPieces)
  return out
}

/**
 * Necessary condition for `dist` to tile the board with **zero empty cells**
 * (a full board). Under a checkerboard coloring, an 8×cols board splits into
 * equal black/white halves; every tetromino except T covers 2 black + 2 white,
 * while each T covers 3 of one color and 1 of the other (imbalance ±2). For the
 * imbalances to cancel to zero, the number of T pieces must be even. This only
 * applies when the distribution fills the whole board — with empty cells the
 * color balance no longer forces even T, so we return true (filter inapplicable).
 *
 * Proven necessary (not sufficient): a `true` result means "not ruled out"; a
 * `false` result means "provably cannot fully tile", so skipping it loses no
 * optimal solution.
 */
export function fullBoardTilingPossible(dist: ShapeCounts, cols: number): boolean {
  if (totalShapeCells(dist) !== boardBits(cols)) return true
  return dist.T % 2 === 0
}

const CELL_BIT_MASKS: Map<number, bigint[]> = new Map()

/** Precomputed `1n << cell` for every cell of a `cols`-wide board. */
function cellBitMasks(cols: number): bigint[] {
  const cached = CELL_BIT_MASKS.get(cols)
  if (cached) return cached
  const n = boardBits(cols)
  const arr: bigint[] = new Array(n)
  for (let i = 0; i < n; i++) arr[i] = 1n << BigInt(i)
  CELL_BIT_MASKS.set(cols, arr)
  return arr
}

const PLACEMENTS_COVERING_CELL: Map<
  string,
  Map<number, ShapePlacement[]>
> = new Map()

/**
 * Index of placements by **every** cell index they cover, per cols. Lets the
 * MRV exact-cover search branch on an arbitrary target cell (the most
 * constrained one) rather than always the lowest empty one.
 */
function placementsCoveringCell(
  shape: ShapeKey,
  cols: number,
): Map<number, ShapePlacement[]> {
  const cacheKey = `${shape}|${cols}`
  const cached = PLACEMENTS_COVERING_CELL.get(cacheKey)
  if (cached) return cached
  const map = new Map<number, ShapePlacement[]>()
  const masks = cellBitMasks(cols)
  for (const pl of placementsForShape(shape, cols)) {
    for (let cell = 0; cell < masks.length; cell++) {
      if ((pl.mask & masks[cell]) !== 0n) {
        let list = map.get(cell)
        if (!list) {
          list = []
          map.set(cell, list)
        }
        list.push(pl)
      }
    }
  }
  PLACEMENTS_COVERING_CELL.set(cacheKey, map)
  return map
}

/**
 * Find the line-maximizing tiling that places exactly `dist[shape]` pieces of
 * each shape, leaving the remainder of cells empty. Returns null if no valid
 * tiling exists at all.
 *
 * Search strategy: branch-and-bound DFS short-circuiting as soon as a tiling
 * is found at `min(targetLines, floor(cellsToPlace / cols))` — i.e., the
 * lower of the caller's target and the geometric line ceiling. If that level
 * turns out to be unreachable due to shape constraints, the search degrades
 * to returning the best tiling actually found.
 *
 * Search order: an Algorithm-X-style exact-cover DFS with a bounded number of
 * "leave empty" moves (`emptyBudget = totalCells - cellsToPlace`, so 0 for a
 * full board). At each node it branches on the **most-constrained** undecided
 * cell — the one coverable in the fewest ways (counting a leave-empty option
 * when budget remains) — and dead-ends the instant a cell can be neither
 * covered nor left empty. This proves infeasibility almost immediately and
 * reaches a target-line tiling fast; picking the branch cell by constraint
 * rather than by index preserves completeness (each distinct piece/empty
 * assignment is still reached exactly once).
 */
/**
 * Hard cap on DFS recursion calls per `tileDistribution` invocation. Caps
 * pathological exhaustion when proving an "almost-tileable" distribution
 * isn't tileable. Generous enough that legitimate searches complete; tight
 * enough that an adversarial dist doesn't dominate `solve()`'s runtime.
 */
const TILE_NODE_BUDGET = 200_000

/** How often (in DFS nodes) to poll the wall clock for the deadline. */
const DEADLINE_CHECK_INTERVAL = 4096

export interface TileOptions {
  /**
   * Abort the search once `performance.now()` passes this timestamp, returning
   * the best tiling found so far (or null). Lets a single call respect the
   * solver's overall time budget instead of running to its node budget.
   */
  deadline?: number
  /** Override the default per-call DFS node budget. */
  nodeBudget?: number
}

export function tileDistribution(
  dist: ShapeCounts,
  cols: number,
  targetLines: number = BOARD_ROWS,
  opts: TileOptions = {},
): TilingResult | null {
  const cellsToPlace = totalShapeCells(dist)
  const totalCells = boardBits(cols)
  if (cellsToPlace > totalCells) return null

  // Provable infeasibility skip: a full board with an odd T-count can't tile.
  if (!fullBoardTilingPossible(dist, cols)) return null

  const nodeBudget = opts.nodeBudget ?? TILE_NODE_BUDGET
  const deadline = opts.deadline ?? Infinity

  const geometricMaxLines = Math.floor(cellsToPlace / cols)
  const effectiveTarget = Math.min(targetLines, geometricMaxLines)
  const rowMasks = fullRowMasks(cols)
  const bitMasks = cellBitMasks(cols)
  const emptyCells = totalCells - cellsToPlace

  const remaining: ShapeCounts = { ...dist }
  const slots: SlotPlacement[] = []
  let best: TilingResult | null = null
  let bestLines = -1
  let stop = false
  let nodes = 0

  function record(occ: bigint): void {
    const lines = countFullRows(occ, cols)
    if (lines > bestLines) {
      bestLines = lines
      best = { slots: slots.slice(), mask: occ, lines }
    }
    if (lines >= effectiveTarget) stop = true
  }

  /**
   * Optimistic bound on the line count any completion of `occ` could reach
   * given `remainingCells` more cells to place. Greedy fill of the rows that
   * are closest to full — ignores tetromino shape constraints, so it's an
   * upper bound (admissible).
   */
  function maxLinesFromState(occ: bigint, remainingCells: number): number {
    let alreadyFull = 0
    const cellsNeededPerRow: number[] = []
    for (let r = 0; r < BOARD_ROWS; r++) {
      const cellsInRow = popcount(occ & rowMasks[r])
      if (cellsInRow === cols) alreadyFull++
      else cellsNeededPerRow.push(cols - cellsInRow)
    }
    cellsNeededPerRow.sort((a, b) => a - b)
    let extra = 0
    let budget = remainingCells
    for (const need of cellsNeededPerRow) {
      if (budget >= need) {
        budget -= need
        extra++
      } else break
    }
    return alreadyFull + extra
  }

  /**
   * MRV exact-cover DFS with a bounded empty-cell budget.
   *
   * `occ` — cells covered by placed pieces. `emptyMask` — cells committed as
   * empty. `remainingCells` — real cells still to place (all pieces placed when
   * 0). `emptyBudget` — leave-empty moves still allowed.
   *
   * At each node we pick the most-constrained undecided cell and branch over
   * every piece that can cover it, plus (if budget remains) leaving it empty. A
   * cell with no covering placement and no remaining budget is a dead end.
   */
  function dfsCover(
    occ: bigint,
    emptyMask: bigint,
    remainingCells: number,
    emptyBudget: number,
  ): void {
    if (stop) return
    if (++nodes > nodeBudget) {
      stop = true
      return
    }
    if (
      deadline !== Infinity &&
      nodes % DEADLINE_CHECK_INTERVAL === 0 &&
      performance.now() > deadline
    ) {
      stop = true
      return
    }
    if (remainingCells === 0) {
      record(occ)
      return
    }

    // Upper-bound prune: if the best line count reachable from here can neither
    // improve `bestLines` nor reach `effectiveTarget`, skip. Ignores committed
    // empties, so it only ever over-estimates — still admissible.
    const ub = maxLinesFromState(occ, remainingCells)
    if (ub <= bestLines && ub < effectiveTarget) return

    const decided = occ | emptyMask

    // MRV: pick the undecided cell with the fewest options (covering placements
    // plus a leave-empty option when budget remains). Zero options is a dead
    // end; one option is a forced move (no better cell can exist).
    let bestCell = -1
    let bestOptions = Infinity
    for (let cell = 0; cell < totalCells; cell++) {
      if ((decided & bitMasks[cell]) !== 0n) continue
      let count = emptyBudget > 0 ? 1 : 0
      for (const shape of SHAPE_KEYS) {
        if (remaining[shape] === 0) continue
        const pls = placementsCoveringCell(shape, cols).get(cell)
        if (!pls) continue
        for (const pl of pls) {
          if ((decided & pl.mask) === 0n) count++
        }
      }
      if (count === 0) return
      if (count < bestOptions) {
        bestOptions = count
        bestCell = cell
        if (count === 1) break
      }
    }

    // Branch: cover the chosen cell with each legal placement.
    for (const shape of SHAPE_KEYS) {
      if (stop) break
      if (remaining[shape] === 0) continue
      const pls = placementsCoveringCell(shape, cols).get(bestCell)
      if (!pls) continue
      remaining[shape]--
      for (const pl of pls) {
        if (stop) break
        if ((decided & pl.mask) !== 0n) continue
        slots.push({
          shape,
          rotation: pl.rotation,
          row: pl.row,
          col: pl.col,
          mask: pl.mask,
        })
        dfsCover(
          occ | pl.mask,
          emptyMask,
          remainingCells - SHAPE_CELLS[shape],
          emptyBudget,
        )
        slots.pop()
      }
      remaining[shape]++
    }

    // Branch: leave the chosen cell empty (spending one unit of budget).
    if (!stop && emptyBudget > 0) {
      dfsCover(occ, emptyMask | bitMasks[bestCell], remainingCells, emptyBudget - 1)
    }
  }

  dfsCover(0n, 0n, cellsToPlace, emptyCells)
  return best
}
