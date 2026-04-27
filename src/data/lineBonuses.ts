import type { StatTotals } from './types'

/**
 * Mount level: number of filled stars. 0 = none, 1–4 = yellow stars, 5–8 = red
 * stars (filled in order yellow1..yellow4, red1..red4). Each "tier 4+L"
 * line-bonus tier unlocks at level (L * 2): 5-line at 2, 6-line at 4, etc.
 */
export type MountLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export const MAX_MOUNT_LEVEL = 8

export interface LineBonusTier {
  /** Minimum number of filled rows for this tier to apply. */
  minLines: number
  /** Stat increments granted by this tier, cumulative on top of lower tiers. */
  bonus: Partial<StatTotals>
  /**
   * Minimum mount level required for this tier to apply. Tiers above the
   * player's current mount level are silently skipped.
   */
  unlockedAtLevel: MountLevel
}

export const LINE_BONUS_TIERS: LineBonusTier[] = [
  { minLines: 1, bonus: { toWeakened: 10 }, unlockedAtLevel: 0 },
  { minLines: 3, bonus: { toWeakened: 15, critDamage: 20 }, unlockedAtLevel: 0 },
  { minLines: 4, bonus: { critDamage: 35 }, unlockedAtLevel: 0 },
  { minLines: 5, bonus: { laceration: 10 }, unlockedAtLevel: 2 },
  { minLines: 6, bonus: { toWeakened: 20, critDamage: 55 }, unlockedAtLevel: 4 },
  { minLines: 7, bonus: { toWeakened: 35, critDamage: 90 }, unlockedAtLevel: 6 },
  { minLines: 8, bonus: { laceration: 20 }, unlockedAtLevel: 8 },
]

/**
 * Highest line count that can grant a bonus at the given mount level. Beyond
 * this, additional filled rows don't change the score.
 */
export function maxBonusLinesForLevel(level: MountLevel): number {
  let max = 0
  for (const tier of LINE_BONUS_TIERS) {
    if (tier.unlockedAtLevel <= level && tier.minLines > max) {
      max = tier.minLines
    }
  }
  return max
}
