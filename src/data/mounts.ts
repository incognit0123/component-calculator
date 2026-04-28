import type { LineBonusTier } from './lineBonuses'

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

export const MOUNTS: Record<MountKey, MountSpec> = {
  electricScooter: {
    key: 'electricScooter',
    name: 'Electric Scooter',
    iconUrl: 'https://sio-cdn.exp0.dev/icons/mounts/electric_scooter.webp',
    bgColor: '#4A93E8',
    cols: 7,
    lineBonusTiers: ELECTRIC_SCOOTER_TIERS,
  },
  techHoverboard: {
    key: 'techHoverboard',
    name: 'Tech Hoverboard',
    iconUrl: 'https://sio-cdn.exp0.dev/icons/mounts/tech_hoverboard.webp',
    bgColor: '#DB25FF',
    cols: 9,
    lineBonusTiers: TECH_HOVERBOARD_TIERS,
  },
  doomsteed: {
    key: 'doomsteed',
    name: 'Doomsteed',
    iconUrl: 'https://sio-cdn.exp0.dev/icons/mounts/doomsteed.webp',
    bgColor: '#FE4C6A',
    cols: 12,
    lineBonusTiers: DOOMSTEED_TIERS,
  },
}

export function isMountKey(value: unknown): value is MountKey {
  return (
    typeof value === 'string' &&
    (MOUNT_KEYS as string[]).includes(value)
  )
}
