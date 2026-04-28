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

function lowestBitIndex(mask: bigint): number {
  if (mask === 0n) return -1
  let idx = 0
  let m = mask
  while ((m & 1n) === 0n) {
    m >>= 1n
    idx++
  }
  return idx
}

const PLACEMENTS_BY_LOWEST_CELL: Map<
  string,
  Map<number, ShapePlacement[]>
> = new Map()

/** Index of placements by the cell index of their lowest set bit, per cols. */
function placementsByLowestCell(
  shape: ShapeKey,
  cols: number,
): Map<number, ShapePlacement[]> {
  const cacheKey = `${shape}|${cols}`
  const cached = PLACEMENTS_BY_LOWEST_CELL.get(cacheKey)
  if (cached) return cached
  const map = new Map<number, ShapePlacement[]>()
  for (const pl of placementsForShape(shape, cols)) {
    const low = lowestBitIndex(pl.mask)
    let list = map.get(low)
    if (!list) {
      list = []
      map.set(low, list)
    }
    list.push(pl)
  }
  PLACEMENTS_BY_LOWEST_CELL.set(cacheKey, map)
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
 * Search order: at each step, address the lowest-indexed empty cell and
 * either place a piece covering it, or (if there are still more empty cells
 * available than pieces remaining) leave it empty. This visits each distinct
 * tiling exactly once.
 */
/**
 * Hard cap on DFS recursion calls per `tileDistribution` invocation. Caps
 * pathological exhaustion when proving an "almost-tileable" distribution
 * isn't tileable. Generous enough that legitimate searches complete; tight
 * enough that an adversarial dist doesn't dominate `solve()`'s runtime.
 */
const TILE_NODE_BUDGET = 200_000

export function tileDistribution(
  dist: ShapeCounts,
  cols: number,
  targetLines: number = BOARD_ROWS,
): TilingResult | null {
  const cellsToPlace = totalShapeCells(dist)
  const totalCells = boardBits(cols)
  if (cellsToPlace > totalCells) return null

  const geometricMaxLines = Math.floor(cellsToPlace / cols)
  const effectiveTarget = Math.min(targetLines, geometricMaxLines)
  const rowMasks = fullRowMasks(cols)

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

  function dfs(occ: bigint, fromIdx: number, remainingCells: number): void {
    if (stop) return
    if (++nodes > TILE_NODE_BUDGET) {
      stop = true
      return
    }
    if (remainingCells === 0) {
      record(occ)
      return
    }

    let cellIdx = fromIdx
    while (cellIdx < totalCells && (occ & (1n << BigInt(cellIdx))) !== 0n) {
      cellIdx++
    }
    if (cellIdx >= totalCells) return

    // Loose feasibility prune: more cells must lie ahead than pieces require.
    if (totalCells - cellIdx < remainingCells) return

    // Upper-bound prune: if the best line count reachable from here can
    // neither improve `bestLines` nor reach `effectiveTarget`, skip.
    const ub = maxLinesFromState(occ, remainingCells)
    if (ub <= bestLines && ub < effectiveTarget) return

    for (const shape of SHAPE_KEYS) {
      if (stop) return
      if (remaining[shape] === 0) continue
      const placements = placementsByLowestCell(shape, cols).get(cellIdx)
      if (!placements) continue
      remaining[shape]--
      for (const pl of placements) {
        if (stop) break
        if ((occ & pl.mask) !== 0n) continue
        slots.push({
          shape,
          rotation: pl.rotation,
          row: pl.row,
          col: pl.col,
          mask: pl.mask,
        })
        dfs(occ | pl.mask, cellIdx + 1, remainingCells - SHAPE_CELLS[shape])
        slots.pop()
      }
      remaining[shape]++
    }

    if (stop) return
    if (totalCells - cellIdx - 1 >= remainingCells) {
      dfs(occ, cellIdx + 1, remainingCells)
    }
  }

  dfs(0n, 0, cellsToPlace)
  return best
}
