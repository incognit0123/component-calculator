import { BUFF_TABLE } from '../data/buffTable'
import { LINE_BONUS_TIERS, type MountLevel } from '../data/lineBonuses'
import { zeroStats } from '../data/stats'
import type { Piece, StatKey, StatTotals } from '../data/types'

/**
 * Mutates `stats` in place to add cumulative line-clear bonuses for L filled
 * rows at the given mount level. Tiers above `mountLevel`'s unlock threshold
 * are skipped. Tiers are defined in `src/data/lineBonuses.ts`.
 */
export function applyLineBonuses(
  stats: StatTotals,
  lines: number,
  mountLevel: MountLevel,
): void {
  for (const tier of LINE_BONUS_TIERS) {
    if (lines < tier.minLines) continue
    if (tier.unlockedAtLevel > mountLevel) continue
    for (const key of Object.keys(tier.bonus) as StatKey[]) {
      const inc = tier.bonus[key]
      if (inc != null) stats[key] += inc
    }
  }
}

/** The damage formula from §2.2. Inputs are percentages. */
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

export function cloneStats(s: StatTotals): StatTotals {
  return { ...s }
}

export function addPieceBuffs(stats: StatTotals, pieces: Piece[]): void {
  for (const p of pieces) {
    stats[p.stat] += BUFF_TABLE[p.quality][p.stat]
  }
}

/** Compute the final score of a set of placed pieces. */
export function scoreLayout(
  currentStats: StatTotals,
  placedPieces: Piece[],
  lines: number,
  mountLevel: MountLevel,
): number {
  const stats = cloneStats(currentStats)
  addPieceBuffs(stats, placedPieces)
  applyLineBonuses(stats, lines, mountLevel)
  return formula(stats)
}

/** Produce the final stats and the full mount contribution (pieces + lines). */
export function finalizeStats(
  currentStats: StatTotals,
  placedPieces: Piece[],
  lines: number,
  mountLevel: MountLevel,
): { final: StatTotals; buffs: StatTotals } {
  const buffs = zeroStats()
  for (const p of placedPieces) {
    buffs[p.stat] += BUFF_TABLE[p.quality][p.stat]
  }
  applyLineBonuses(buffs, lines, mountLevel)
  const final = cloneStats(currentStats)
  for (const k of Object.keys(final) as (keyof StatTotals)[]) {
    final[k] += buffs[k]
  }
  return { final, buffs }
}
