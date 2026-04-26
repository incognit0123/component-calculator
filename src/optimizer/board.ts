import { SHAPE_ROTATIONS } from '../data/shapes'
import type { ShapeKey } from '../data/types'
import { BOARD_COLS, BOARD_ROWS } from './types'

export const BOARD_BITS = BOARD_ROWS * BOARD_COLS

const ROW_MASK = (1n << BigInt(BOARD_COLS)) - 1n

export const FULL_ROW_MASKS: bigint[] = (() => {
  const masks: bigint[] = []
  for (let r = 0; r < BOARD_ROWS; r++) {
    masks.push(ROW_MASK << BigInt(r * BOARD_COLS))
  }
  return masks
})()

export const FULL_BOARD: bigint = (1n << BigInt(BOARD_BITS)) - 1n

export function bitFor(row: number, col: number): bigint {
  return 1n << BigInt(row * BOARD_COLS + col)
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
export function countFullRows(occ: bigint): number {
  let n = 0
  for (let r = 0; r < BOARD_ROWS; r++) {
    if ((occ & FULL_ROW_MASKS[r]) === FULL_ROW_MASKS[r]) n++
  }
  return n
}

/** Bitmask of rows that are fully filled. */
export function fullRowsMask(occ: bigint): number {
  let mask = 0
  for (let r = 0; r < BOARD_ROWS; r++) {
    if ((occ & FULL_ROW_MASKS[r]) === FULL_ROW_MASKS[r]) mask |= 1 << r
  }
  return mask
}

export interface ShapePlacement {
  rotation: number
  row: number
  col: number
  mask: bigint
}

const PLACEMENTS_CACHE = new Map<ShapeKey, ShapePlacement[]>()

/** All valid placements of a shape on an empty board. */
export function placementsForShape(shape: ShapeKey): ShapePlacement[] {
  const cached = PLACEMENTS_CACHE.get(shape)
  if (cached) return cached
  const rotations = SHAPE_ROTATIONS[shape]
  const out: ShapePlacement[] = []
  for (let rot = 0; rot < rotations.length; rot++) {
    const cells = rotations[rot]
    let rows = 0
    let cols = 0
    for (const [r, c] of cells) {
      if (r + 1 > rows) rows = r + 1
      if (c + 1 > cols) cols = c + 1
    }
    for (let r = 0; r + rows <= BOARD_ROWS; r++) {
      for (let c = 0; c + cols <= BOARD_COLS; c++) {
        let mask = 0n
        for (const [dr, dc] of cells) {
          mask |= bitFor(r + dr, c + dc)
        }
        out.push({ rotation: rot, row: r, col: c, mask })
      }
    }
  }
  PLACEMENTS_CACHE.set(shape, out)
  return out
}

/** Expand occupancy into a 2D array for rendering. */
export function occupancyTo2D(occ: bigint): boolean[][] {
  const out: boolean[][] = []
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: boolean[] = []
    for (let c = 0; c < BOARD_COLS; c++) {
      row.push((occ & bitFor(r, c)) !== 0n)
    }
    out.push(row)
  }
  return out
}
