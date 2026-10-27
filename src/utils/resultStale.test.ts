import { describe, expect, it } from 'vitest'
import type { Piece } from '../data/types'
import type { OptimizerResult } from '../optimizer/types'
import { isResultStale } from './resultStale'

const piece = (id: string): Piece => ({
  id,
  shape: 'O',
  quality: 'good',
  stat: 'critDamage',
})

const result = {
  boards: [{ placements: [{ pieceId: 'a' }, { pieceId: 'b' }] }],
  unusedPieceIds: ['c'],
} as unknown as OptimizerResult

describe('isResultStale', () => {
  it('is fresh when the inventory matches the run', () => {
    expect(isResultStale(result, [piece('a'), piece('b'), piece('c')])).toBe(false)
  })
  it('is stale when a placed piece is deleted', () => {
    expect(isResultStale(result, [piece('b'), piece('c')])).toBe(true)
  })
  it('is stale when a piece is added', () => {
    expect(
      isResultStale(result, [piece('a'), piece('b'), piece('c'), piece('d')]),
    ).toBe(true)
  })
  it('is stale when an unused piece is swapped for a new one', () => {
    expect(isResultStale(result, [piece('a'), piece('b'), piece('d')])).toBe(true)
  })
})
