import { describe, expect, it } from 'vitest'
import { MOUNTS, MOUNT_KEYS, syncRateFor } from './mounts'
import { maxBonusLinesForLevel } from './lineBonuses'

describe('Netherflame Stalker', () => {
  it('is registered with the Doomsteed board and sync rates', () => {
    expect(MOUNT_KEYS).toContain('netherflameStalker')
    expect(MOUNTS.netherflameStalker.cols).toBe(12)
    expect(MOUNTS.netherflameStalker.bgColor).toBe(MOUNTS.doomsteed.bgColor)
    expect(MOUNTS.netherflameStalker.syncRates).toEqual(
      MOUNTS.doomsteed.syncRates,
    )
    expect(syncRateFor('netherflameStalker', 8)).toBe(100)
  })

  it('uses the standard line unlock levels', () => {
    const tiers = MOUNTS.netherflameStalker.lineBonusTiers
    expect(tiers.map((tier) => tier.unlockedAtLevel)).toEqual([
      0, 0, 0, 0, 2, 4, 6, 8,
    ])
    expect(maxBonusLinesForLevel(0, tiers)).toBe(4)
    expect(maxBonusLinesForLevel(8, tiers)).toBe(8)
  })
})
