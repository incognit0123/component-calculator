import { describe, expect, it } from 'vitest'
import { MOUNTS, MOUNT_KEYS } from './mounts'
import { maxBonusLinesForLevel } from './lineBonuses'
import { zeroStats } from './stats'
import { applyLineBonuses } from '../optimizer/scoring'
import type { MountLevel } from './lineBonuses'

it.each([
  ['electricScooter', [30, 32, 35, 40, 45, 52, 60, 70, 80]],
  ['techHoverboard', [45, 48, 52, 57, 62, 69, 75, 82, 100]],
] as const)('uses Expo’s sync rates at each star level for %s', (key, expected) => {
  expect(MOUNTS[key].syncRates).toEqual(expected)
})

it('uses Expo’s updated nine-level sync table for every Legendary mount', () => {
  for (const key of ['doomsteed', 'netherflameStalker', 'ruinWarskitter'] as const) {
    expect(MOUNTS[key].syncRates).toEqual([60, 65, 75, 92, 112, 132, 152, 175, 200])
  }
})

describe('Netherflame Stalker', () => {
  it('is registered with the Doomsteed board and sync rates', () => {
    expect(MOUNT_KEYS).toContain('netherflameStalker')
    expect(MOUNTS.netherflameStalker.cols).toBe(12)
    expect(MOUNTS.netherflameStalker.bgColor).toBe(MOUNTS.doomsteed.bgColor)
    expect(MOUNTS.netherflameStalker.syncRates).toEqual(
      MOUNTS.doomsteed.syncRates,
    )
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

describe('Ruinous Warskitter', () => {
  it('uses the original game artwork, name, board and sync rates with complete bonuses', () => {
    const mount = MOUNTS.ruinWarskitter
    expect(MOUNT_KEYS).toContain('ruinWarskitter')
    expect(mount.cols).toBe(MOUNTS.netherflameStalker.cols)
    expect(mount.syncRates).toEqual(MOUNTS.netherflameStalker.syncRates)
    expect(mount.name).toBe('Ruinous Warskitter')
    expect(mount.iconUrl).toBeDefined()
    expect(mount.lineBonusesPending).not.toBe(true)
    expect(maxBonusLinesForLevel(0, mount.lineBonusTiers)).toBe(4)
    expect(maxBonusLinesForLevel(8, mount.lineBonusTiers)).toBe(8)
  })

  it.each([
    { lines: 5, level: 2, bonus: { shieldDamage: 60 } },
    { lines: 6, level: 4, bonus: { shieldDamage: 20, toChilled: 60 } },
    { lines: 7, level: 6, bonus: { shieldDamage: 35, toBosses: 25 } },
  ])('unlocks the pictured $lines-line bonus at level $level', ({ lines, level, bonus }) => {
    const locked = zeroStats()
    const unlocked = zeroStats()
    applyLineBonuses(locked, lines, MOUNTS.ruinWarskitter.lineBonusTiers, (level - 1) as MountLevel)
    applyLineBonuses(unlocked, lines, MOUNTS.ruinWarskitter.lineBonusTiers, level as MountLevel)
    for (const key of Object.keys(locked) as (keyof typeof locked)[]) {
      expect((unlocked[key] ?? 0) - (locked[key] ?? 0)).toBe((bonus as Partial<typeof locked>)[key] ?? 0)
    }
  })

  it.each([
    { rows: 0, vulnerability: 30, shieldDamage: 0, toChilled: 0, toBosses: 0 },
    { rows: 1, vulnerability: 30, shieldDamage: 10, toChilled: 40, toBosses: 0 },
    { rows: 2, vulnerability: 30, shieldDamage: 10, toChilled: 40, toBosses: 0 },
    { rows: 3, vulnerability: 30, shieldDamage: 25, toChilled: 40, toBosses: 15 },
    { rows: 4, vulnerability: 130, shieldDamage: 25, toChilled: 40, toBosses: 15 },
    { rows: 5, vulnerability: 130, shieldDamage: 85, toChilled: 40, toBosses: 15 },
    { rows: 6, vulnerability: 130, shieldDamage: 105, toChilled: 100, toBosses: 15 },
    { rows: 7, vulnerability: 130, shieldDamage: 140, toChilled: 100, toBosses: 40 },
    { rows: 8, vulnerability: 230, shieldDamage: 140, toChilled: 100, toBosses: 40 },
  ])('matches the provided cumulative bonuses at $rows rows', ({ rows, ...expected }) => {
    const stats = zeroStats()
    applyLineBonuses(stats, rows, MOUNTS.ruinWarskitter.lineBonusTiers, 8)
    expect(stats).toEqual({ ...zeroStats(), ...expected })
  })

  it('adds another 100% Vulnerability at eight rows and four red stars', () => {
    const before = zeroStats()
    const after = zeroStats()
    applyLineBonuses(before, 7, MOUNTS.ruinWarskitter.lineBonusTiers, 8)
    applyLineBonuses(after, 8, MOUNTS.ruinWarskitter.lineBonusTiers, 8)
    expect(after).toEqual({ ...before, vulnerability: 230 })
    expect(before.vulnerability).toBe(130)
  })
})
