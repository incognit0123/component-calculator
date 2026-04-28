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
  /**
   * Minimum mount level required for this tier to apply. Tiers above the
   * player's current mount level are silently skipped.
   */
  unlockedAtLevel: MountLevel
  /**
   * Static stat increments granted by this tier, cumulative on top of lower
   * tiers. Mutually exclusive with `compute`.
   */
  bonus?: Partial<StatTotals>
  /**
   * Dynamic bonus that depends on the running stat totals (pre-mount + piece
   * buffs + earlier line-bonus tiers, all already accumulated). Mutually
   * exclusive with `bonus`. Used for Doomsteed's 8-line toBosses tier, which
   * scales with the final toPoisoned value.
   */
  compute?: (statsSoFar: StatTotals) => Partial<StatTotals>
}

/**
 * Highest line count that can grant a bonus at the given mount level for the
 * given tier list. Beyond this, additional filled rows don't change the score.
 */
export function maxBonusLinesForLevel(
  level: MountLevel,
  tiers: LineBonusTier[],
): number {
  let max = 0
  for (const tier of tiers) {
    if (tier.unlockedAtLevel <= level && tier.minLines > max) {
      max = tier.minLines
    }
  }
  return max
}
