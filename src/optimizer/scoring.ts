import { BUFF_TABLE } from '../data/buffTable'
import type { LineBonusTier, MountLevel } from '../data/lineBonuses'
import { zeroStats } from '../data/stats'
import type { Piece, StatKey, StatTotals } from '../data/types'

/**
 * Mutates `stats` in place to add cumulative line-clear bonuses for L filled
 * rows under the given tier list. Tiers above `mountLevel`'s unlock threshold
 * are skipped.
 *
 * Tiers are applied in array order, so a `compute` tier (e.g. Doomsteed's
 * 8-line toBosses-from-toPoisoned) must be ordered after every tier whose
 * static bonus it depends on. Compute tiers see `stats` as fully accumulated
 * by the caller (typically pre-mount + piece buffs) plus any earlier line
 * bonuses applied within this call.
 */
export function applyLineBonuses(
  stats: StatTotals,
  lines: number,
  tiers: LineBonusTier[],
  mountLevel: MountLevel,
): void {
  for (const tier of tiers) {
    if (lines < tier.minLines) continue
    if (tier.unlockedAtLevel > mountLevel) continue
    const inc = tier.bonus ?? tier.compute?.(stats)
    if (!inc) continue
    for (const key of Object.keys(inc) as StatKey[]) {
      const v = inc[key]
      if (v != null) stats[key] += v
    }
  }
}

/** The damage formula. Inputs are percentages. */
export function formula(s: StatTotals): number {
  return (
    (1 + s.critDamage / 100) *
    (1 + s.skillDamage / 100) *
    (1 + s.shieldDamage / 100) *
    (1 + s.laceration / 100) *
    (1 + s.toBosses / 100) *
    (1 + (s.toWeakened + s.toPoisoned + s.toChilled) / 100)
  )
}

/**
 * Marginal damage-formula gain of adding a single piece's full buff on top of
 * `currentStats`: `formula(currentStats + pieceBuff) − formula(currentStats)`.
 * Ignores line bonuses and sync-rate scaling — purely a ranking signal for
 * sorting the inventory against the player's pre-mount stats.
 */
export function marginalGainOf(piece: Piece, currentStats: StatTotals): number {
  const before = formula(currentStats)
  const after = cloneStats(currentStats)
  after[piece.stat] += BUFF_TABLE[piece.quality][piece.stat]
  return formula(after) - before
}

export function cloneStats(s: StatTotals): StatTotals {
  return { ...s }
}

/**
 * Add piece buffs to `stats`. `multiplier` (default 1) scales each piece's
 * buff value before adding — used to model non-equipped mounts' sync rates,
 * where pieces only contribute a fraction of their full buff to the player.
 */
export function addPieceBuffs(
  stats: StatTotals,
  pieces: Piece[],
  multiplier = 1,
): void {
  for (const p of pieces) {
    stats[p.stat] += BUFF_TABLE[p.quality][p.stat] * multiplier
  }
}

/** Compute the final score of a set of placed pieces. */
export function scoreLayout(
  currentStats: StatTotals,
  placedPieces: Piece[],
  lines: number,
  tiers: LineBonusTier[],
  mountLevel: MountLevel,
  pieceBuffMultiplier = 1,
): number {
  const stats = cloneStats(currentStats)
  addPieceBuffs(stats, placedPieces, pieceBuffMultiplier)
  applyLineBonuses(stats, lines, tiers, mountLevel)
  return formula(stats)
}

/**
 * Produce the final stats and the mount contribution split into the piece
 * buffs and the line-clear bonuses.
 *
 * `compute` tiers depend on the running stat totals, so we accumulate piece
 * buffs into a running copy of `currentStats` first, then run the tiers
 * against that — ensuring compute tiers see pre-mount + piece + earlier-tier
 * contributions.
 */
export function finalizeStats(
  currentStats: StatTotals,
  placedPieces: Piece[],
  lines: number,
  tiers: LineBonusTier[],
  mountLevel: MountLevel,
  pieceBuffMultiplier = 1,
): {
  final: StatTotals
  buffsFromPieces: StatTotals
  buffsFromLines: StatTotals
} {
  const afterPieces = cloneStats(currentStats)
  addPieceBuffs(afterPieces, placedPieces, pieceBuffMultiplier)

  const final = cloneStats(afterPieces)
  applyLineBonuses(final, lines, tiers, mountLevel)

  const buffsFromPieces = zeroStats()
  const buffsFromLines = zeroStats()
  for (const k of Object.keys(buffsFromPieces) as StatKey[]) {
    buffsFromPieces[k] = afterPieces[k] - currentStats[k]
    buffsFromLines[k] = final[k] - afterPieces[k]
  }
  return { final, buffsFromPieces, buffsFromLines }
}
