import type { LineBonusTier, MountLevel } from './lineBonuses'
import electricScooterIcon from '../assets/icons/mounts/electric_scooter.webp'
import techHoverboardIcon from '../assets/icons/mounts/tech_hoverboard.webp'
import doomsteedIcon from '../assets/icons/mounts/doomsteed.webp'

export type MountKey = 'electricScooter' | 'techHoverboard' | 'doomsteed'

export interface MountSpec {
  key: MountKey
  name: string
  iconUrl: string
  /** Background polygon fill color (clipped-corner square behind the icon). */
  bgColor: string
  /** Board column count. Rows are always 8 across all mounts. */
  cols: number
  lineBonusTiers: LineBonusTier[]
  /**
   * Sync-rate percentages indexed by MountLevel (0..8). When this mount is
   * NOT the equipped one, pieces placed on its board only contribute
   * (syncRates[level] / 100) of their full stat buff to the player. Values
   * are absolute, not cumulative — `syncRates[1]` is the rate at level 1, not
   * an increment over `syncRates[0]`. The equipped mount always grants
   * full buffs regardless of this list.
   */
  syncRates: number[]
}

export const MOUNT_KEYS: MountKey[] = [
  'electricScooter',
  'techHoverboard',
  'doomsteed',
]

export const DEFAULT_MOUNT_KEY: MountKey = 'electricScooter'

const ELECTRIC_SCOOTER_TIERS: LineBonusTier[] = [
  { minLines: 1, unlockedAtLevel: 0, bonus: { toWeakened: 10 } },
  { minLines: 3, unlockedAtLevel: 0, bonus: { toWeakened: 15, critDamage: 20 } },
  { minLines: 4, unlockedAtLevel: 0, bonus: { critDamage: 35 } },
  { minLines: 5, unlockedAtLevel: 2, bonus: { laceration: 10 } },
  { minLines: 6, unlockedAtLevel: 4, bonus: { toWeakened: 20, critDamage: 55 } },
  { minLines: 7, unlockedAtLevel: 6, bonus: { toWeakened: 35, critDamage: 90 } },
  { minLines: 8, unlockedAtLevel: 8, bonus: { laceration: 20 } },
]

const TECH_HOVERBOARD_TIERS: LineBonusTier[] = [
  { minLines: 1, unlockedAtLevel: 0, bonus: { toChilled: 15, skillDamage: 10 } },
  { minLines: 3, unlockedAtLevel: 0, bonus: { toChilled: 25, skillDamage: 15 } },
  { minLines: 4, unlockedAtLevel: 0, bonus: { shieldDamage: 40 } },
  { minLines: 5, unlockedAtLevel: 2, bonus: { toChilled: 60 } },
  { minLines: 6, unlockedAtLevel: 4, bonus: { toChilled: 40, skillDamage: 30 } },
  { minLines: 7, unlockedAtLevel: 6, bonus: { toChilled: 60, skillDamage: 45 } },
  { minLines: 8, unlockedAtLevel: 8, bonus: { shieldDamage: 60 } },
]

const DOOMSTEED_TIERS: LineBonusTier[] = [
  { minLines: 1, unlockedAtLevel: 0, bonus: { toPoisoned: 20 } },
  { minLines: 3, unlockedAtLevel: 0, bonus: { toPoisoned: 40, skillDamage: 50 } },
  { minLines: 4, unlockedAtLevel: 0, bonus: { skillDamage: 150 } },
  { minLines: 6, unlockedAtLevel: 4, bonus: { toPoisoned: 60, laceration: 30 } },
  { minLines: 7, unlockedAtLevel: 6, bonus: { toPoisoned: 80, toBosses: 5 } },
  {
    minLines: 8,
    unlockedAtLevel: 8,
    // For every 160% total toPoisoned (pre-mount + piece buffs + earlier line
    // tiers), grant +5 toBosses, capped at +25.
    compute: (s) => ({
      toBosses: Math.min(25, Math.floor(s.toPoisoned / 160) * 5),
    }),
  },
]

// Sync-rate percentages indexed by MountLevel 0..8 (0 stars, then 1..4 yellow,
// then 1..4 red). Source: in-game mount data.
const ELECTRIC_SCOOTER_SYNC_RATES: number[] = [20, 22, 24, 28, 32, 38, 44, 52, 60]
const TECH_HOVERBOARD_SYNC_RATES: number[] = [30, 33, 36, 40, 45, 50, 55, 60, 75]
const DOOMSTEED_SYNC_RATES: number[] = [40, 44, 48, 55, 62, 71, 80, 90, 100]

export const MOUNTS: Record<MountKey, MountSpec> = {
  electricScooter: {
    key: 'electricScooter',
    name: 'Electric Scooter',
    iconUrl: electricScooterIcon,
    bgColor: '#4A93E8',
    cols: 7,
    lineBonusTiers: ELECTRIC_SCOOTER_TIERS,
    syncRates: ELECTRIC_SCOOTER_SYNC_RATES,
  },
  techHoverboard: {
    key: 'techHoverboard',
    name: 'Tech Hoverboard',
    iconUrl: techHoverboardIcon,
    bgColor: '#DB25FF',
    cols: 9,
    lineBonusTiers: TECH_HOVERBOARD_TIERS,
    syncRates: TECH_HOVERBOARD_SYNC_RATES,
  },
  doomsteed: {
    key: 'doomsteed',
    name: 'Doomsteed',
    iconUrl: doomsteedIcon,
    bgColor: '#FE4C6A',
    cols: 12,
    lineBonusTiers: DOOMSTEED_TIERS,
    syncRates: DOOMSTEED_SYNC_RATES,
  },
}

/** Sync-rate percentage for a mount at the given level. */
export function syncRateFor(key: MountKey, level: MountLevel): number {
  return MOUNTS[key].syncRates[level]
}

export function isMountKey(value: unknown): value is MountKey {
  return (
    typeof value === 'string' &&
    (MOUNT_KEYS as string[]).includes(value)
  )
}
