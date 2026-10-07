import { BUFF_TABLE } from '../data/buffTable'
import type { LineBonusTier, MountLevel } from '../data/lineBonuses'
import { SHAPE_KEYS } from '../data/shapes'
import { DEBUFF_PRIORITY, debuffRank } from '../data/stats'
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

// Scores within this relative tolerance are treated as ties. Float sums taken in
// different orders differ by ~1e-16, which would otherwise make the winner
// depend on traversal order.
const TIE_EPS = 1e-9

function isTie(a: number, b: number): boolean {
  return Math.abs(a - b) <= TIE_EPS * Math.max(1, Math.abs(a), Math.abs(b))
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
 *
 * NOTE: this routine treats the line bonus as a static increment applied
 * once up-front. That holds for tiers with fixed `bonus` values; for tiers
 * with a `compute` callback (e.g. Doomsteed's 8-line toBosses-from-toPoisoned),
 * the bonus is sampled with the *baseline* stats (currentStats + earlier
 * static tiers) — i.e. before piece buffs are added. So the optimizer's
 * objective slightly under-estimates the contribution of a piece that pushes
 * toPoisoned past the next 160% threshold. The optimizer's selected layout
 * is still scored end-to-end via `scoreLayout`, which evaluates `compute`
 * against the final stats, so the displayed score is correct; only the
 * selection objective is approximate.
 */
export function selectPieces(
  inventory: Piece[],
  dist: ShapeCounts,
  lineCount: number,
  currentStats: StatTotals,
  tiers: LineBonusTier[],
  mountLevel: MountLevel,
  pieceBuffMultiplier = 1,
): SelectionResult {
  const baseStats = cloneStats(currentStats)
  applyLineBonuses(baseStats, lineCount, tiers, mountLevel)
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
        buff: BUFF_TABLE[p.quality][p.stat] * pieceBuffMultiplier,
        pieces: [],
      }
      groups.set(key, g)
    }
    g.pieces.push(p)
  }
  const buckets = Array.from(groups.values())
  // Make the result independent of inventory order: pieces within a bucket are
  // interchangeable, so take them in a fixed (id) order.
  for (const b of buckets) {
    b.pieces.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  }

  // Order DFS by descending standalone marginal under the line-bonused stats.
  // Doesn't affect correctness — only how fast we find a strong best-so-far,
  // which in turn tightens the upper-bound prune.
  function marginalAtBase(b: Bucket): number {
    const s = cloneStats(baseStats)
    s[b.stat] += b.buff
    return formula(s) - baseScore
  }
  const marginals = new Map(buckets.map((b) => [b, marginalAtBase(b)]))
  buckets.sort((a, b) => {
    const ma = marginals.get(a)!
    const mb = marginals.get(b)!
    if (!isTie(ma, mb)) return mb - ma
    // Ties: debuff priority (chilled > poisoned > weakened), then a fixed
    // total order so the DFS visits buckets identically for any inventory order.
    return (
      debuffRank(a.stat) - debuffRank(b.stat) ||
      (a.stat < b.stat ? -1 : a.stat > b.stat ? 1 : 0) ||
      (a.quality < b.quality ? -1 : a.quality > b.quality ? 1 : 0) ||
      SHAPE_KEYS.indexOf(a.shape) - SHAPE_KEYS.indexOf(b.shape)
    )
  })

  const slotsLeft: ShapeCounts = { ...dist }
  const accumStats = cloneStats(baseStats)
  const pickCounts: number[] = new Array(buckets.length).fill(0)
  let bestScore = baseScore
  let bestPickCounts: number[] = pickCounts.slice()
  let bestDebuffs = debuffVector(baseStats)

  /** Debuff totals in priority order; compared lexicographically on ties. */
  function debuffVector(st: StatTotals): number[] {
    return DEBUFF_PRIORITY.map((k) => st[k])
  }

  /** True if `a` favors higher-priority debuffs than `b` (more chilled first). */
  function prefersDebuffs(a: number[], b: number[]): boolean {
    for (let i = 0; i < a.length; i++) {
      if (!isTie(a[i], b[i])) return a[i] > b[i]
    }
    return false
  }

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
      if (!isTie(score, bestScore) && score > bestScore) {
        bestScore = score
        bestPickCounts = pickCounts.slice()
        bestDebuffs = debuffVector(accumStats)
      } else if (isTie(score, bestScore)) {
        const dv = debuffVector(accumStats)
        if (prefersDebuffs(dv, bestDebuffs)) {
          bestPickCounts = pickCounts.slice()
          bestDebuffs = dv
          bestScore = Math.max(bestScore, score)
        }
      }
      return
    }
    if (idx >= buckets.length) return
    const ub = upperBound(idx)
    if (ub < bestScore && !isTie(ub, bestScore)) return

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
