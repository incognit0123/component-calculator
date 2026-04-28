import { SHAPE_ROTATIONS } from '../data/shapes'
import type { ShapeKey } from '../data/types'
import { BOARD_ROWS } from './types'

export function boardBits(cols: number): number {
  return BOARD_ROWS * cols
}

const ROW_MASK_CACHE = new Map<number, bigint>()
function rowMask(cols: number): bigint {
  const cached = ROW_MASK_CACHE.get(cols)
  if (cached !== undefined) return cached
  const m = (1n << BigInt(cols)) - 1n
  ROW_MASK_CACHE.set(cols, m)
  return m
}

const FULL_ROW_MASKS_CACHE = new Map<number, bigint[]>()
export function fullRowMasks(cols: number): bigint[] {
  const cached = FULL_ROW_MASKS_CACHE.get(cols)
  if (cached) return cached
  const base = rowMask(cols)
  const masks: bigint[] = []
  for (let r = 0; r < BOARD_ROWS; r++) {
    masks.push(base << BigInt(r * cols))
  }
  FULL_ROW_MASKS_CACHE.set(cols, masks)
  return masks
}

const FULL_BOARD_CACHE = new Map<number, bigint>()
export function fullBoard(cols: number): bigint {
  const cached = FULL_BOARD_CACHE.get(cols)
  if (cached !== undefined) return cached
  const m = (1n << BigInt(boardBits(cols))) - 1n
  FULL_BOARD_CACHE.set(cols, m)
  return m
}

export function bitFor(row: number, col: number, cols: number): bigint {
  return 1n << BigInt(row * cols + col)
}

/** Number of set bits in a bitboard. */
export function popcount(occ: bigint): number {
  let n = 0
  let b = occ
  while (b !== 0n) {
    b &= b - 1n
    n++
  }
  return n
}

/** Count fully-occupied rows in the bitboard. */
export function countFullRows(occ: bigint, cols: number): number {
  const masks = fullRowMasks(cols)
  let n = 0
  for (let r = 0; r < BOARD_ROWS; r++) {
    if ((occ & masks[r]) === masks[r]) n++
  }
  return n
}

/** Bitmask of rows that are fully filled. */
export function fullRowsMask(occ: bigint, cols: number): number {
  const masks = fullRowMasks(cols)
  let mask = 0
  for (let r = 0; r < BOARD_ROWS; r++) {
    if ((occ & masks[r]) === masks[r]) mask |= 1 << r
  }
  return mask
}

export interface ShapePlacement {
  rotation: number
  row: number
  col: number
  mask: bigint
}

const PLACEMENTS_CACHE = new Map<string, ShapePlacement[]>()

/** All valid placements of a shape on an empty board of the given width. */
export function placementsForShape(
  shape: ShapeKey,
  cols: number,
): ShapePlacement[] {
  const cacheKey = `${shape}|${cols}`
  const cached = PLACEMENTS_CACHE.get(cacheKey)
  if (cached) return cached
  const rotations = SHAPE_ROTATIONS[shape]
  const out: ShapePlacement[] = []
  for (let rot = 0; rot < rotations.length; rot++) {
    const cells = rotations[rot]
    let rows = 0
    let pcols = 0
    for (const [r, c] of cells) {
      if (r + 1 > rows) rows = r + 1
      if (c + 1 > pcols) pcols = c + 1
    }
    for (let r = 0; r + rows <= BOARD_ROWS; r++) {
      for (let c = 0; c + pcols <= cols; c++) {
        let mask = 0n
        for (const [dr, dc] of cells) {
          mask |= bitFor(r + dr, c + dc, cols)
        }
        out.push({ rotation: rot, row: r, col: c, mask })
      }
    }
  }
  PLACEMENTS_CACHE.set(cacheKey, out)
  return out
}

/** Expand occupancy into a 2D array for rendering. */
export function occupancyTo2D(occ: bigint, cols: number): boolean[][] {
  const out: boolean[][] = []
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: boolean[] = []
    for (let c = 0; c < cols; c++) {
      row.push((occ & bitFor(r, c, cols)) !== 0n)
    }
    out.push(row)
  }
  return out
}
