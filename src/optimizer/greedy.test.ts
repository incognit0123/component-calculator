import { describe, expect, it } from 'vitest'
import { QUALITIES } from '../data/qualities'
import { SHAPE_KEYS } from '../data/shapes'
import { STATS, zeroStats } from '../data/stats'
import type { Piece } from '../data/types'
import { createGreedyEstimator } from './greedy'
import { selectPieces } from './selection'
import { emptyShapeCounts } from './tiling'

let seed = 11
const rnd = () =>
  (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

function randomInventory(n: number): Piece[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    shape: SHAPE_KEYS[Math.floor(rnd() * 5)],
    quality: QUALITIES[Math.floor(rnd() * 7)].key,
    stat: STATS[Math.floor(rnd() * 8)].key,
  }))
}

describe('greedy estimator', () => {
  const stats = { ...zeroStats(), critDamage: 100, skillDamage: 60 }

  it('never exceeds the exact selection and stays close to it', () => {
    let worst = 1
    for (let trial = 0; trial < 40; trial++) {
      const inv = randomInventory(60)
      const dist = emptyShapeCounts()
      dist.O = 2
      dist.I = 2
      dist.T = 2
      dist.L = 2
      dist.J = 2
      const exact = selectPieces(inv, dist, 0, stats, [], 0).score
      const est = createGreedyEstimator(inv, stats, [], 0, 1).estimate(dist, 0)
      expect(est).toBeLessThanOrEqual(exact * (1 + 1e-9))
      worst = Math.min(worst, est / exact)
    }
    // Greedy's worst-case undershoot; solve.ts's GAIN_SLACK must cover this.
    expect(worst).toBeGreaterThan(0)
    expect(worst).toBeGreaterThanOrEqual(0.985)
  })

  it('returns 0 when the inventory cannot supply the shape mix', () => {
    const inv: Piece[] = [
      { id: 'a', shape: 'O', quality: 'legend', stat: 'critDamage' },
    ]
    const dist = emptyShapeCounts()
    dist.T = 1
    expect(createGreedyEstimator(inv, stats, [], 0, 1).estimate(dist, 0)).toBe(0)
  })

  it('breaks equal-value ties toward chilled > poisoned > weakened', () => {
    const mk = (id: string, stat: Piece['stat']): Piece => ({
      id,
      shape: 'O',
      quality: 'legend',
      stat,
    })
    const dist = emptyShapeCounts()
    dist.O = 1
    const first = (inv: Piece[]) =>
      createGreedyEstimator(inv, stats, [], 0, 1).pick(dist, 0).picks[0].stat
    const w = mk('w', 'toWeakened')
    const p = mk('p', 'toPoisoned')
    const c = mk('c', 'toChilled')
    expect(first([w, p, c])).toBe('toChilled')
    expect(first([c, p, w])).toBe('toChilled')
    expect(first([w, p])).toBe('toPoisoned')
  })
})
