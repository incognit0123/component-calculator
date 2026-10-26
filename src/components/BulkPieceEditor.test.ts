import { describe, expect, it } from 'vitest'
import type { Piece } from '../data/types'
import { applyCounts, countPieces } from './BulkPieceEditor'

const p = (id: string): Piece => ({
  id,
  shape: 'O',
  quality: 'good',
  stat: 'critDamage',
})
const K = 'critDamage|good|O'

describe('applyCounts', () => {
  it('drops unused pieces before placed ones when decreasing', () => {
    // a, b placed; c, d unused (c is oldest of the unused, a is oldest overall)
    const pieces = [p('c'), p('a'), p('b'), p('d')]
    const out = applyCounts(pieces, { [K]: 2 }, new Set(['c', 'd']))
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b'])
  })
  it('without unused info drops the newest', () => {
    const out = applyCounts([p('a'), p('b'), p('c')], { [K]: 2 })
    expect(out.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('result matches the draft counts exactly, whatever the starting inventory', () => {
    const pieces: Piece[] = [p('a'), p('b'), { ...p('c'), shape: 'T' }]
    const draft = { [K]: 3, 'skillDamage|epic|L': 2, 'critDamage|good|T': 0 }
    const out = applyCounts(pieces, draft, new Set(['b']))
    const expected = { [K]: 3, 'skillDamage|epic|L': 2 }
    expect(countPieces(out)).toEqual(expected)
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length)
  })
})
