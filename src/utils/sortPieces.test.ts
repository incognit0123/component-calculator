import { describe, expect, it } from 'vitest'
import { zeroStats } from '../data/stats'
import type { Piece, StatTotals } from '../data/types'
import { sortByMarginalGain, sortByQualityShape } from './sortPieces'

function piece(id: string, p: Omit<Piece, 'id'>): Piece {
  return { id, ...p }
}

describe('sortByQualityShape', () => {
  it('orders by quality high-to-low first', () => {
    const input = [
      piece('a', { shape: 'O', quality: 'good', stat: 'critDamage' }),
      piece('b', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('c', { shape: 'O', quality: 'epic', stat: 'critDamage' }),
    ]
    expect(sortByQualityShape(input).map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks ties on shape (O,I,T,L,J)', () => {
    const input = [
      piece('j', { shape: 'J', quality: 'legend', stat: 'critDamage' }),
      piece('o', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('t', { shape: 'T', quality: 'legend', stat: 'critDamage' }),
      piece('i', { shape: 'I', quality: 'legend', stat: 'critDamage' }),
      piece('l', { shape: 'L', quality: 'legend', stat: 'critDamage' }),
    ]
    expect(sortByQualityShape(input).map((p) => p.id)).toEqual([
      'o',
      'i',
      't',
      'l',
      'j',
    ])
  })

  it('breaks ties on stat declared order after shape', () => {
    const input = [
      piece('boss', { shape: 'O', quality: 'legend', stat: 'toBosses' }),
      piece('skill', { shape: 'O', quality: 'legend', stat: 'skillDamage' }),
      piece('crit', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('lacer', { shape: 'O', quality: 'legend', stat: 'laceration' }),
    ]
    expect(sortByQualityShape(input).map((p) => p.id)).toEqual([
      'crit',
      'skill',
      'lacer',
      'boss',
    ])
  })

  it('returns a new array and leaves the input untouched', () => {
    const input = [
      piece('a', { shape: 'O', quality: 'good', stat: 'critDamage' }),
      piece('b', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
    ]
    const snapshot = input.map((p) => p.id)
    const out = sortByQualityShape(input)
    expect(input.map((p) => p.id)).toEqual(snapshot)
    expect(out).not.toBe(input)
  })

  it('handles an empty inventory', () => {
    expect(sortByQualityShape([])).toEqual([])
  })
})

describe('sortByMarginalGain', () => {
  it('ranks higher-buff pieces above lower-buff at zero stats', () => {
    const input = [
      piece('good', { shape: 'O', quality: 'good', stat: 'critDamage' }),
      piece('legend', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('epic', { shape: 'O', quality: 'epic', stat: 'critDamage' }),
    ]
    expect(
      sortByMarginalGain(input, zeroStats()).map((p) => p.id),
    ).toEqual(['legend', 'epic', 'good'])
  })

  it('reorders based on which stat has the highest current synergy', () => {
    const stats: StatTotals = {
      ...zeroStats(),
      // High crit damage → adding skill damage gets multiplied by a big crit
      // factor, so the skill-damage piece beats the larger raw-buff crit piece.
      critDamage: 1000,
      skillDamage: 0,
    }
    const input = [
      piece('crit', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('skill', { shape: 'O', quality: 'good', stat: 'skillDamage' }),
    ]
    expect(sortByMarginalGain(input, stats).map((p) => p.id)).toEqual([
      'skill',
      'crit',
    ])
  })

  it('is stable on exact ties', () => {
    const input = [
      piece('a', { shape: 'O', quality: 'legend', stat: 'critDamage' }),
      piece('b', { shape: 'I', quality: 'legend', stat: 'critDamage' }),
      piece('c', { shape: 'T', quality: 'legend', stat: 'critDamage' }),
    ]
    expect(
      sortByMarginalGain(input, zeroStats()).map((p) => p.id),
    ).toEqual(['a', 'b', 'c'])
  })

  it('returns a new array and leaves the input untouched', () => {
    const input = [
      piece('a', { shape: 'O', quality: 'good', stat: 'critDamage' }),
      piece('b', { shape: 'O', quality: 'legend', stat: 'skillDamage' }),
    ]
    const snapshot = input.map((p) => p.id)
    const out = sortByMarginalGain(input, zeroStats())
    expect(input.map((p) => p.id)).toEqual(snapshot)
    expect(out).not.toBe(input)
  })

  it('handles an empty inventory', () => {
    expect(sortByMarginalGain([], zeroStats())).toEqual([])
  })
})
