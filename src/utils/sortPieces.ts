import { BUFF_TABLE } from '../data/buffTable'
import { QUALITIES } from '../data/qualities'
import { SHAPE_KEYS } from '../data/shapes'
import { STAT_KEYS } from '../data/stats'
import type { Piece, QualityTier, ShapeKey, StatKey, StatTotals } from '../data/types'
import { marginalGainOf } from '../optimizer/scoring'

const QUALITY_RANK: Record<QualityTier, number> = Object.fromEntries(
  QUALITIES.map((q, i) => [q.key, i]),
) as Record<QualityTier, number>

const SHAPE_RANK: Record<ShapeKey, number> = Object.fromEntries(
  SHAPE_KEYS.map((s, i) => [s, i]),
) as Record<ShapeKey, number>

const STAT_RANK: Record<StatKey, number> = Object.fromEntries(
  STAT_KEYS.map((k, i) => [k, i]),
) as Record<StatKey, number>

/**
 * Sort pieces high-to-low by quality, then by shape (declared O,I,T,L,J order),
 * then by stat (declared order in `src/data/stats.ts`), then by buff value.
 * Returns a new array; does not mutate the input.
 */
export function sortByQualityShape(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    const q = QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]
    if (q !== 0) return q
    const s = SHAPE_RANK[a.shape] - SHAPE_RANK[b.shape]
    if (s !== 0) return s
    const t = STAT_RANK[a.stat] - STAT_RANK[b.stat]
    if (t !== 0) return t
    return BUFF_TABLE[b.quality][b.stat] - BUFF_TABLE[a.quality][a.stat]
  })
}

/**
 * Sort pieces by shape (declared O,I,T,L,J order), then high-to-low by quality,
 * then by stat (declared order in `src/data/stats.ts`), then by buff value.
 * Returns a new array; does not mutate the input.
 */
export function sortByShapeQuality(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    const s = SHAPE_RANK[a.shape] - SHAPE_RANK[b.shape]
    if (s !== 0) return s
    const q = QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]
    if (q !== 0) return q
    const t = STAT_RANK[a.stat] - STAT_RANK[b.stat]
    if (t !== 0) return t
    return BUFF_TABLE[b.quality][b.stat] - BUFF_TABLE[a.quality][a.stat]
  })
}

/**
 * Sort pieces high-to-low by marginal damage-formula gain against
 * `currentStats`. Marginal gain is computed once per piece (cheap; the formula
 * is linear in each individual stat) and the resulting sort is stable on ties.
 * Returns a new array; does not mutate the input.
 */
export function sortByMarginalGain(
  pieces: Piece[],
  currentStats: StatTotals,
): Piece[] {
  const gains = pieces.map((p, i) => ({
    piece: p,
    gain: marginalGainOf(p, currentStats),
    i,
  }))
  gains.sort((a, b) => {
    const d = b.gain - a.gain
    return d !== 0 ? d : a.i - b.i
  })
  return gains.map((g) => g.piece)
}
