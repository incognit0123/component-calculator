import { BUFF_TABLE } from '../data/buffTable'
import { SHAPE_KEYS } from '../data/shapes'
import type {
  Piece,
  QualityTier,
  ShapeKey,
  StatKey,
  StatTotals,
} from '../data/types'
import { applyLineBonuses, cloneStats, formula } from './scoring'
import type { ShapeCounts } from './tiling'

interface Bucket {
  shape: ShapeKey
  stat: StatKey
  quality: QualityTier
  buff: number
  pieces: Piece[]
}

export interface SelectionResult {
  picks: Piece[]
  score: number
}

/**
 * Pick exactly `dist[shape]` pieces of each shape from `inventory` to
 * maximize formula(currentStats + lineBonus(lineCount) + sum-of-buffs).
 *
 * Pieces sharing the same (shape, stat, quality) are interchangeable: only
 * counts per bucket affect the score, so we collapse the inventory into
 * buckets and DFS over per-bucket pick counts.
 *
 * Caller must ensure `dist[shape] <= inventoryShapeCounts(inventory)[shape]`
 * for every shape — otherwise no feasible selection exists and the result
 * falls back to the no-pieces baseline.
 */
export function selectPieces(
  inventory: Piece[],
  dist: ShapeCounts,
  lineCount: number,
  currentStats: StatTotals,
): SelectionResult {
  const baseStats = cloneStats(currentStats)
  applyLineBonuses(baseStats, lineCount)
  const baseScore = formula(baseStats)

  const groups = new Map<string, Bucket>()
  for (const p of inventory) {
    const key = `${p.shape}|${p.stat}|${p.quality}`
    let g = groups.get(key)
    if (!g) {
      g = {
        shape: p.shape,
        stat: p.stat,
        quality: p.quality,
        buff: BUFF_TABLE[p.quality][p.stat],
        pieces: [],
      }
      groups.set(key, g)
    }
    g.pieces.push(p)
  }
  const buckets = Array.from(groups.values())

  // Order DFS by descending standalone marginal under the line-bonused stats.
  // Doesn't affect correctness — only how fast we find a strong best-so-far,
  // which in turn tightens the upper-bound prune.
  function marginalAtBase(b: Bucket): number {
    const s = cloneStats(baseStats)
    s[b.stat] += b.buff
    return formula(s) - baseScore
  }
  buckets.sort((a, b) => marginalAtBase(b) - marginalAtBase(a))

  const slotsLeft: ShapeCounts = { ...dist }
  const accumStats = cloneStats(baseStats)
  const pickCounts: number[] = new Array(buckets.length).fill(0)
  let bestScore = baseScore
  let bestPickCounts: number[] = pickCounts.slice()

  function totalSlotsLeft(): number {
    let n = 0
    for (const s of SHAPE_KEYS) n += slotsLeft[s]
    return n
  }

  /**
   * Multiplicative upper bound on any completion's score from buckets[idx:].
   *
   * For each piece i, formula(accumStats + buff_i) / formula(accumStats) is
   * its "standalone ratio". When pieces are added in any order, each piece's
   * actual ratio in the cumulative product is ≤ its standalone ratio (the
   * stat it buffs only grows, so its marginal multiplier shrinks). So the
   * product of the per-shape top-slot standalone ratios is ≥ any feasible
   * selection's score / formula(accumStats).
   */
  function upperBound(idx: number): number {
    const currScore = formula(accumStats)
    const ratiosByShape: Record<ShapeKey, number[]> = {
      O: [],
      I: [],
      T: [],
      L: [],
      J: [],
    }
    for (let i = idx; i < buckets.length; i++) {
      const b = buckets[i]
      const cap = Math.min(b.pieces.length, slotsLeft[b.shape])
      if (cap === 0) continue
      const s = cloneStats(accumStats)
      s[b.stat] += b.buff
      const r = formula(s) / currScore
      const list = ratiosByShape[b.shape]
      for (let j = 0; j < cap; j++) list.push(r)
    }
    let bound = currScore
    for (const shape of SHAPE_KEYS) {
      const ratios = ratiosByShape[shape]
      if (ratios.length === 0) continue
      ratios.sort((a, b) => b - a)
      const k = Math.min(slotsLeft[shape], ratios.length)
      for (let j = 0; j < k; j++) bound *= ratios[j]
    }
    return bound
  }

  function dfs(idx: number): void {
    if (totalSlotsLeft() === 0) {
      const score = formula(accumStats)
      if (score > bestScore) {
        bestScore = score
        bestPickCounts = pickCounts.slice()
      }
      return
    }
    if (idx >= buckets.length) return
    if (upperBound(idx) <= bestScore) return

    const bucket = buckets[idx]
    const maxPick = Math.min(bucket.pieces.length, slotsLeft[bucket.shape])

    for (let c = maxPick; c >= 0; c--) {
      pickCounts[idx] = c
      slotsLeft[bucket.shape] -= c
      accumStats[bucket.stat] += c * bucket.buff

      dfs(idx + 1)

      accumStats[bucket.stat] -= c * bucket.buff
      slotsLeft[bucket.shape] += c
      pickCounts[idx] = 0
    }
  }

  dfs(0)

  const picks: Piece[] = []
  for (let i = 0; i < buckets.length; i++) {
    const c = bestPickCounts[i]
    for (let j = 0; j < c; j++) picks.push(buckets[i].pieces[j])
  }
  return { picks, score: bestScore }
}
