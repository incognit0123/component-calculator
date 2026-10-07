import { BUFF_TABLE } from '../data/buffTable'
import type { LineBonusTier, MountLevel } from '../data/lineBonuses'
import { SHAPE_KEYS } from '../data/shapes'
import { debuffRank } from '../data/stats'
import type { Piece, ShapeKey, StatKey, StatTotals } from '../data/types'
import { applyLineBonuses, cloneStats, formula } from './scoring'
import type { ShapeCounts } from './tiling'

/**
 * Fast greedy estimate of the best selection score for a fixed shape mix.
 *
 * Within one (shape, stat) a higher-quality piece is strictly better, so each
 * (shape, stat) is a queue of buffs sorted best-first and only its head is ever
 * a candidate. At every step we take whichever head raises the damage formula
 * the most against the *running* stats (so diminishing returns are recomputed
 * after each pick), respecting the remaining slots per shape.
 *
 * It costs microseconds per mix (vs milliseconds for the exact DFS in
 * `selectPieces`), which makes it usable to rank tens of thousands of mixes.
 * It is an estimate, not a bound: the exact selection can score slightly
 * higher, so callers re-run `selectPieces` on the mixes they actually keep.
 */

// Factor slot for each stat: the three debuff stats share one pool factor.
const FACTOR_OF: Record<StatKey, number> = {
  critDamage: 0,
  skillDamage: 1,
  shieldDamage: 2,
  laceration: 3,
  toBosses: 4,
  toWeakened: 5,
  toPoisoned: 5,
  toChilled: 5,
}
const NUM_FACTORS = 6
// Debuffs first in priority order (chilled > poisoned > weakened): every loop
// below keeps the first of equal candidates, so this makes ties favor chilled.
// Array.sort is stable, so non-debuff stats keep their relative order.
const STAT_LIST = (Object.keys(FACTOR_OF) as StatKey[]).sort(
  (a, b) => debuffRank(a) - debuffRank(b),
)

function factorsOf(s: StatTotals): Float64Array {
  const f = new Float64Array(NUM_FACTORS)
  f[0] = 1 + s.critDamage / 100
  f[1] = 1 + s.skillDamage / 100
  f[2] = 1 + s.shieldDamage / 100
  f[3] = 1 + s.laceration / 100
  f[4] = 1 + s.toBosses / 100
  f[5] = 1 + (s.toWeakened + s.toPoisoned + s.toChilled) / 100
  return f
}

export interface GreedyEstimator {
  /** Estimated best score for `dist` assuming `lines` filled rows. */
  estimate(dist: ShapeCounts, lines: number): number
  /** Same search, but also returns the concrete pieces it chose. */
  pick(dist: ShapeCounts, lines: number): { score: number; picks: Piece[] }
}

export function createGreedyEstimator(
  inventory: Piece[],
  currentStats: StatTotals,
  tiers: LineBonusTier[],
  mountLevel: MountLevel,
  pieceBuffMultiplier: number,
): GreedyEstimator {
  // queues[shapeIdx][statIdx] = buffs (percent, already scaled), best first.
  const queues: number[][][] = SHAPE_KEYS.map(() => STAT_LIST.map(() => []))
  const pieceQueues: Piece[][][] = SHAPE_KEYS.map(() => STAT_LIST.map(() => []))
  const sorted = [...inventory].sort(
    (a, b) => BUFF_TABLE[b.quality][b.stat] - BUFF_TABLE[a.quality][a.stat],
  )
  for (const p of sorted) {
    const si = SHAPE_KEYS.indexOf(p.shape)
    const ti = STAT_LIST.indexOf(p.stat)
    queues[si][ti].push(BUFF_TABLE[p.quality][p.stat] * pieceBuffMultiplier)
    pieceQueues[si][ti].push(p)
  }

  const baseCache = new Map<number, { factors: Float64Array; score: number }>()
  function baseFor(lines: number) {
    let hit = baseCache.get(lines)
    if (!hit) {
      const stats = cloneStats(currentStats)
      applyLineBonuses(stats, lines, tiers, mountLevel)
      hit = { factors: factorsOf(stats), score: formula(stats) }
      baseCache.set(lines, hit)
    }
    return hit
  }

  const ptr = new Int32Array(SHAPE_KEYS.length * STAT_LIST.length)
  const slots = new Int32Array(SHAPE_KEYS.length)
  const f = new Float64Array(NUM_FACTORS)

  const f2 = new Float64Array(NUM_FACTORS)
  const NS = STAT_LIST.length

  /**
   * 1-swap local search: replace one picked piece with the best remaining
   * piece of the same shape but a different stat whenever that raises the
   * score, until no swap helps. Closes most of greedy's gap to the optimum.
   * Swaps keep each shape's slot count, so the result stays feasible.
   */
  function improve(
    base: { factors: Float64Array; score: number },
    startScore: number,
  ): number {
    let score = startScore
    for (let iter = 0; iter < 50; iter++) {
      let bestGain = score * 1e-12
      let bSi = -1
      let bFrom = -1
      let bTo = -1
      let bScore = score
      for (let si = 0; si < SHAPE_KEYS.length; si++) {
        for (let from = 0; from < NS; from++) {
          const kFrom = ptr[si * NS + from]
          if (kFrom === 0) continue
          const bFromBuff = queues[si][from][kFrom - 1]
          for (let to = 0; to < NS; to++) {
            if (to === from) continue
            const q = queues[si][to]
            const kTo = ptr[si * NS + to]
            if (kTo >= q.length) continue
            f2.set(f)
            f2[FACTOR_OF[STAT_LIST[from]]] -= bFromBuff / 100
            f2[FACTOR_OF[STAT_LIST[to]]] += q[kTo] / 100
            let sc = base.score
            for (let i = 0; i < NUM_FACTORS; i++) {
              sc *= f2[i] / base.factors[i]
            }
            if (sc - score > bestGain) {
              bestGain = sc - score
              bSi = si
              bFrom = from
              bTo = to
              bScore = sc
            }
          }
        }
      }
      if (bSi < 0) break
      const kFrom = --ptr[bSi * NS + bFrom]
      const kTo = ptr[bSi * NS + bTo]++
      f[FACTOR_OF[STAT_LIST[bFrom]]] -= queues[bSi][bFrom][kFrom] / 100
      f[FACTOR_OF[STAT_LIST[bTo]]] += queues[bSi][bTo][kTo] / 100
      score = bScore
    }
    return score
  }

  function run(dist: ShapeCounts, lines: number): number {
      const base = baseFor(lines)
      f.set(base.factors)
      ptr.fill(0)
      let score = base.score
      let remaining = 0
      for (let si = 0; si < SHAPE_KEYS.length; si++) {
        slots[si] = dist[SHAPE_KEYS[si] as ShapeKey]
        remaining += slots[si]
      }
      while (remaining > 0) {
        let bestRatio = 0
        let bestSi = -1
        let bestTi = -1
        for (let si = 0; si < SHAPE_KEYS.length; si++) {
          if (slots[si] === 0) continue
          const row = queues[si]
          for (let ti = 0; ti < STAT_LIST.length; ti++) {
            const q = row[ti]
            const k = ptr[si * STAT_LIST.length + ti]
            if (k >= q.length) continue
            const fi = FACTOR_OF[STAT_LIST[ti]]
            const ratio = (f[fi] + q[k] / 100) / f[fi]
            if (ratio > bestRatio) {
              bestRatio = ratio
              bestSi = si
              bestTi = ti
            }
          }
        }
        // Not enough pieces of the needed shapes: this mix is infeasible.
        if (bestSi < 0) return 0
        const k = ptr[bestSi * STAT_LIST.length + bestTi]++
        f[FACTOR_OF[STAT_LIST[bestTi]]] += queues[bestSi][bestTi][k] / 100
        score *= bestRatio
        slots[bestSi]--
        remaining--
      }
      return improve(base, score)
  }

  return {
    estimate: run,
    pick(dist, lines) {
      const score = run(dist, lines)
      const picks: Piece[] = []
      if (score === 0) return { score, picks }
      for (let si = 0; si < SHAPE_KEYS.length; si++) {
        for (let ti = 0; ti < NS; ti++) {
          for (let k = 0; k < ptr[si * NS + ti]; k++) {
            picks.push(pieceQueues[si][ti][k])
          }
        }
      }
      return { score, picks }
    },
  }
}
