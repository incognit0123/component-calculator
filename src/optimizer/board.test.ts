import { describe, expect, it } from 'vitest'
import { SHAPE_KEYS, SHAPE_ROTATIONS, shapeBounds } from '../data/shapes'
import {
  bitFor,
  countFullRows,
  FULL_BOARD,
  FULL_ROW_MASKS,
  fullRowsMask,
  placementsForShape,
} from './board'
import { BOARD_COLS, BOARD_ROWS } from './types'

describe('shape rotations', () => {
  it('every rotation has min row/col equal to 0', () => {
    for (const s of SHAPE_KEYS) {
      for (const rot of SHAPE_ROTATIONS[s]) {
        const rs = rot.map(([r]) => r)
        const cs = rot.map(([, c]) => c)
        expect(Math.min(...rs)).toBe(0)
        expect(Math.min(...cs)).toBe(0)
      }
    }
  })
  it('every rotation has exactly 4 cells', () => {
    for (const s of SHAPE_KEYS) {
      for (const rot of SHAPE_ROTATIONS[s]) {
        expect(rot.length).toBe(4)
      }
    }
  })
  it('O has 1 rotation, I has 2, T/L/J have 4', () => {
    expect(SHAPE_ROTATIONS.O.length).toBe(1)
    expect(SHAPE_ROTATIONS.I.length).toBe(2)
    expect(SHAPE_ROTATIONS.T.length).toBe(4)
    expect(SHAPE_ROTATIONS.L.length).toBe(4)
    expect(SHAPE_ROTATIONS.J.length).toBe(4)
  })
  it('shapeBounds gives 2x2 for O', () => {
    expect(shapeBounds(SHAPE_ROTATIONS.O[0])).toEqual({ rows: 2, cols: 2 })
  })
})

describe('countFullRows / fullRowsMask', () => {
  it('returns 0 for empty board', () => {
    expect(countFullRows(0n)).toBe(0)
    expect(fullRowsMask(0n)).toBe(0)
  })
  it('detects a full row', () => {
    const row2 = FULL_ROW_MASKS[2]
    expect(countFullRows(row2)).toBe(1)
    expect(fullRowsMask(row2)).toBe(1 << 2)
  })
  it('full board has all BOARD_ROWS rows', () => {
    expect(countFullRows(FULL_BOARD)).toBe(BOARD_ROWS)
    expect(fullRowsMask(FULL_BOARD)).toBe((1 << BOARD_ROWS) - 1)
  })
  it('does not count column fills as rows', () => {
    let col = 0n
    for (let r = 0; r < BOARD_ROWS; r++) col |= bitFor(r, 3)
    expect(countFullRows(col)).toBe(0)
  })
})

describe('placementsForShape', () => {
  it('O (2x2) has (ROWS-1)*(COLS-1) placements', () => {
    expect(placementsForShape('O').length).toBe((BOARD_ROWS - 1) * (BOARD_COLS - 1))
  })
  it('I total = horizontal + vertical placements', () => {
    const horiz = BOARD_ROWS * (BOARD_COLS - 4 + 1)
    const vert = (BOARD_ROWS - 4 + 1) * BOARD_COLS
    expect(placementsForShape('I').length).toBe(horiz + vert)
  })
  it('placement masks have popcount 4', () => {
    for (const pl of placementsForShape('T')) {
      let bits = 0
      let m = pl.mask
      while (m !== 0n) {
        bits++
        m &= m - 1n
      }
      expect(bits).toBe(4)
    }
  })
})
