import { describe, expect, it } from 'vitest'
import type { Piece } from '../data/types'
import { BOARD_BITS, FULL_BOARD, popcount } from './board'
import { BOARD_ROWS } from './types'
import {
  emptyShapeCounts,
  enumerateDistributions,
  inventoryShapeCounts,
  SHAPE_CELLS,
  tileDistribution,
  totalShapeCells,
  type ShapeCounts,
} from './tiling'

function counts(parts: Partial<ShapeCounts>): ShapeCounts {
  return { ...emptyShapeCounts(), ...parts }
}

describe('SHAPE_CELLS', () => {
  it('every shape has 4 cells', () => {
    for (const v of Object.values(SHAPE_CELLS)) expect(v).toBe(4)
  })
})

describe('inventoryShapeCounts', () => {
  it('groups pieces by shape', () => {
    const pieces: Piece[] = [
      { id: 'a', shape: 'O', quality: 'good', stat: 'critDamage' },
      { id: 'b', shape: 'O', quality: 'good', stat: 'critDamage' },
      { id: 'c', shape: 'I', quality: 'good', stat: 'critDamage' },
    ]
    expect(inventoryShapeCounts(pieces)).toEqual(counts({ O: 2, I: 1 }))
  })

  it('returns zeros for an empty inventory', () => {
    expect(inventoryShapeCounts([])).toEqual(emptyShapeCounts())
  })
})

describe('totalShapeCells', () => {
  it('sums per-shape cell counts', () => {
    expect(totalShapeCells(counts({ O: 3, I: 2 }))).toBe(20)
    expect(totalShapeCells(counts({}))).toBe(0)
  })
})

describe('enumerateDistributions', () => {
  it('returns just the empty tuple for totalPieces=0', () => {
    expect(enumerateDistributions(counts({ O: 5, I: 5 }), 0)).toEqual([
      emptyShapeCounts(),
    ])
  })

  it('respects per-shape inventory limits', () => {
    const dists = enumerateDistributions(counts({ O: 2, T: 1 }), 2)
    expect(dists).toContainEqual(counts({ O: 2 }))
    expect(dists).toContainEqual(counts({ O: 1, T: 1 }))
    // Cannot reach 2 with only 1 T and no other shapes — but {T:1} is only 1.
    expect(dists.length).toBe(2)
  })

  it('returns nothing when totalPieces exceeds inventory size', () => {
    expect(enumerateDistributions(counts({ O: 2 }), 5)).toEqual([])
  })

  it('every yielded tuple sums to totalPieces and fits inventory', () => {
    const inv = counts({ O: 3, I: 3, T: 3, L: 3, J: 3 })
    const dists = enumerateDistributions(inv, 5)
    expect(dists.length).toBeGreaterThan(0)
    for (const d of dists) {
      expect(d.O + d.I + d.T + d.L + d.J).toBe(5)
      expect(d.O).toBeLessThanOrEqual(inv.O)
      expect(d.I).toBeLessThanOrEqual(inv.I)
      expect(d.T).toBeLessThanOrEqual(inv.T)
      expect(d.L).toBeLessThanOrEqual(inv.L)
      expect(d.J).toBeLessThanOrEqual(inv.J)
    }
  })
})

describe('tileDistribution', () => {
  it('returns a trivial tiling for the empty distribution', () => {
    const result = tileDistribution(emptyShapeCounts())
    expect(result).not.toBeNull()
    expect(result!.slots).toEqual([])
    expect(result!.mask).toBe(0n)
    expect(result!.lines).toBe(0)
  })

  it('places a single O piece', () => {
    const result = tileDistribution(counts({ O: 1 }))
    expect(result).not.toBeNull()
    expect(result!.slots.length).toBe(1)
    expect(result!.slots[0].shape).toBe('O')
    expect(popcount(result!.mask)).toBe(4)
    expect(result!.lines).toBe(0)
  })

  it('returns null when total cells exceed the board', () => {
    // 15 tetrominoes = 60 cells > 56 cells on 8×7
    expect(tileDistribution(counts({ O: 15 }))).toBeNull()
  })

  it('returns null for 14 Os (cannot tile a 7-wide row)', () => {
    // 3 Os per row-pair fills cols 0-5; col 6 is a 1-wide strip Os cannot reach.
    // Max is 12 Os, so 14 is geometrically infeasible.
    expect(tileDistribution(counts({ O: 14 }))).toBeNull()
  })

  it('tiles 14 I-pieces into a full board (8 lines)', () => {
    const result = tileDistribution(counts({ I: 14 }))
    expect(result).not.toBeNull()
    expect(result!.slots.length).toBe(14)
    expect(result!.mask).toBe(FULL_BOARD)
    expect(result!.lines).toBe(BOARD_ROWS)
  })

  it('short-circuits early when a target line count is reached', () => {
    // A full-board tiling has 8 lines. Asking for >=4 should still return a
    // tiling that satisfies that (it may or may not be full-board).
    const result = tileDistribution(counts({ I: 14 }), 4)
    expect(result).not.toBeNull()
    expect(result!.lines).toBeGreaterThanOrEqual(4)
  })

  it('respects the per-distribution piece counts', () => {
    const result = tileDistribution(counts({ O: 3, I: 2, T: 1 }))
    expect(result).not.toBeNull()
    const observed = inventoryShapeCounts(
      result!.slots.map((s, i) => ({
        id: String(i),
        shape: s.shape,
        quality: 'good' as const,
        stat: 'critDamage' as const,
      })),
    )
    expect(observed).toEqual(counts({ O: 3, I: 2, T: 1 }))
  })

  it('uses only cells covered by the returned slots', () => {
    const result = tileDistribution(counts({ O: 2, I: 2, T: 1 }))
    expect(result).not.toBeNull()
    let union = 0n
    for (const s of result!.slots) union |= s.mask
    expect(union).toBe(result!.mask)
    expect(popcount(result!.mask)).toBe(
      2 * SHAPE_CELLS.O + 2 * SHAPE_CELLS.I + 1 * SHAPE_CELLS.T,
    )
    expect(popcount(result!.mask)).toBeLessThanOrEqual(BOARD_BITS)
  })

  it('finds the line-maximizing tiling when leaving cells empty', () => {
    // 13 I-pieces = 52 cells. The 4 leftover cells should all fit into a
    // single row to give max-L=7 (since I-pieces tile every row trivially).
    const result = tileDistribution(counts({ I: 13 }))
    expect(result).not.toBeNull()
    expect(result!.slots.length).toBe(13)
    expect(result!.lines).toBe(BOARD_ROWS - 1)
  })
})
