import type { StatTotals } from './types'

export interface LineBonusTier {
  /** Minimum number of filled rows for this tier to apply. */
  minLines: number
  /** Stat increments granted by this tier, cumulative on top of lower tiers. */
  bonus: Partial<StatTotals>
}

export const LINE_BONUS_TIERS: LineBonusTier[] = [
  { minLines: 1, bonus: { toWeakened: 10 } },
  { minLines: 3, bonus: { toWeakened: 15, critDamage: 20 } },
  { minLines: 4, bonus: { critDamage: 35 } },
]

export const MAX_BONUS_LINES = LINE_BONUS_TIERS.reduce(
  (max, tier) => Math.max(max, tier.minLines),
  0,
)
