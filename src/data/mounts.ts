import type { LineBonusTier, MountLevel } from './lineBonuses'
import electricScooterIcon from '../assets/icons/mounts/electric_scooter.webp'
import techHoverboardIcon from '../assets/icons/mounts/tech_hoverboard.webp'
import doomsteedIcon from '../assets/icons/mounts/doomsteed.webp'
import netherflameStalkerIcon from '../assets/icons/mounts/netherflame_stalker.webp'
import ruinousWarskitterIcon from '../assets/icons/mounts/ruinous_warskitter.webp'

export type MountKey =
  | 'electricScooter'
  | 'techHoverboard'
  | 'doomsteed'
  | 'netherflameStalker'
  | 'ruinWarskitter'

export interface MountSpec {
  key: MountKey
  name: string
  iconUrl?: string
  /** Background polygon fill color (clipped-corner square behind the icon). */
  bgColor: string
  /** Board column count. Rows are always 8 across all mounts. */
  cols: number
  lineBonusTiers: LineBonusTier[]
  /** Unknown bonuses are excluded from scoring and displayed as TBA. */
  lineBonusesPending?: boolean
  /** Assumptions and unscored effects, shown when the equipped tier is active. */
  lineBonusNotes?: {
    minLines: number
    unlockedAtLevel: MountLevel
    text: string
  }[]
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
  'netherflameStalker',
  'ruinWarskitter',
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
// then 1..4 red). Verified against Expo's calculator on 2026-11-22.
const ELECTRIC_SCOOTER_SYNC_RATES: number[] = [30, 32, 35, 40, 45, 52, 60, 70, 80]
const TECH_HOVERBOARD_SYNC_RATES: number[] = [45, 48, 52, 57, 62, 69, 75, 82, 100]
// Expo's calculator uses this table for all three Legendary mounts (2026-11-21).
const LEGENDARY_SYNC_RATES: number[] = [60, 65, 75, 92, 112, 132, 152, 175, 200]

const NETHERFLAME_STALKER_TIERS: LineBonusTier[] = [
  { minLines: 1, unlockedAtLevel: 0, bonus: { toChilled: 30 } },
  { minLines: 2, unlockedAtLevel: 0, bonus: { skillDamage: 100 } },
  {
    minLines: 3,
    unlockedAtLevel: 0,
    bonus: { toChilled: 70, toBosses: 10 },
  },
  { minLines: 4, unlockedAtLevel: 0, bonus: {} },
  { minLines: 5, unlockedAtLevel: 2, bonus: { skillDamage: 100 } },
  {
    minLines: 6,
    unlockedAtLevel: 4,
    bonus: { toChilled: 100, shieldDamage: 60 },
  },
  { minLines: 7, unlockedAtLevel: 6, bonus: { toBosses: 30 } },
  { minLines: 8, unlockedAtLevel: 8, bonus: { shieldDamage: 120 } },
]

// Cross-checked against Expo's deployed calculator on 2026-11-18.
// Source details and the base-effect distinction: docs/notes/ruinous-warskitter-exp0-audit.md.
const RUINOUS_WARSKITTER_TIERS: LineBonusTier[] = [
  // Base Ruinous Shot effect while equipped; assume the debuff is maintained.
  { minLines: 0, unlockedAtLevel: 0, bonus: { vulnerability: 30 } },
  { minLines: 1, unlockedAtLevel: 0, bonus: { shieldDamage: 10, toChilled: 40 } },
  // Extends Vulnerability duration by 5s, with no additional magnitude under
  // the maintained-debuff assumption.
  { minLines: 2, unlockedAtLevel: 0, bonus: {} },
  { minLines: 3, unlockedAtLevel: 0, bonus: { shieldDamage: 15, toBosses: 15 } },
  // Five Enhancement stacks at +20% each, reached after 250 Ruinous Shots.
  { minLines: 4, unlockedAtLevel: 0, bonus: { vulnerability: 100 } },
  // At the user's requested maximum six stacks: 6 * 10% Shield Damage.
  { minLines: 5, unlockedAtLevel: 2, bonus: { shieldDamage: 60 } },
  { minLines: 6, unlockedAtLevel: 4, bonus: { shieldDamage: 20, toChilled: 60 } },
  { minLines: 7, unlockedAtLevel: 6, bonus: { shieldDamage: 35, toBosses: 25 } },
  // Adds another +20% per Enhancement stack: 5 * 20 = +100%, not +20% total.
  { minLines: 8, unlockedAtLevel: 8, bonus: { vulnerability: 100 } },
]

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
    syncRates: LEGENDARY_SYNC_RATES,
  },
  netherflameStalker: {
    key: 'netherflameStalker',
    name: 'Netherflame Stalker',
    iconUrl: netherflameStalkerIcon,
    bgColor: '#FE4C6A',
    cols: 12,
    lineBonusTiers: NETHERFLAME_STALKER_TIERS,
    syncRates: LEGENDARY_SYNC_RATES,
  },
  ruinWarskitter: {
    key: 'ruinWarskitter',
    name: 'Ruinous Warskitter',
    iconUrl: ruinousWarskitterIcon,
    bgColor: '#FE4C6A',
    cols: 12,
    lineBonusTiers: RUINOUS_WARSKITTER_TIERS,
    lineBonusNotes: [
      {
        minLines: 0, unlockedAtLevel: 0,
        text: 'Assumes Ruinous Shot Vulnerability is maintained during combat. Direct mount attack damage is excluded.',
      },
      {
        minLines: 4, unlockedAtLevel: 0,
        text: 'Assumes five Enhancement stacks (+100% Vulnerability), reached after 250 Ruinous Shots.',
      },
      {
        minLines: 5, unlockedAtLevel: 2,
        text: 'Assumes six stacks for the 5-line bonus (+60% Shield Damage).',
      },
      {
        minLines: 8, unlockedAtLevel: 8,
        text: 'The 8-line bonus adds another +100% Vulnerability at five Enhancement stacks (230% total from this mount).',
      },
    ],
    syncRates: LEGENDARY_SYNC_RATES,
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
