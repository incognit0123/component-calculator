import type { StatKey, StatTotals } from './types'

export interface StatMeta {
  key: StatKey
  name: string
  short: string
  icon: string
}

export const STATS: StatMeta[] = [
  {
    key: 'critDamage',
    name: 'Crit Damage',
    short: 'Crit',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/inspiration.webp',
  },
  {
    key: 'skillDamage',
    name: 'Skill Damage',
    short: 'Skill',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/encouragement.webp',
  },
  {
    key: 'shieldDamage',
    name: 'Shield Damage',
    short: 'Shield',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/shield_damage.webp',
  },
  {
    key: 'toWeakened',
    name: 'Damage to Weakened',
    short: 'Weakened',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/weakened.webp',
  },
  {
    key: 'toPoisoned',
    name: 'Damage to Poisoned',
    short: 'Poisoned',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/poisoned.webp',
  },
  {
    key: 'toChilled',
    name: 'Damage to Chilled',
    short: 'Chilled',
    icon: 'https://sio-cdn.exp0.dev/icons/pets/skills/chilled.webp',
  },
  {
    key: 'laceration',
    name: 'Laceration',
    short: 'Lacer.',
    icon: 'https://sio-cdn.exp0.dev/icons/stats/laceration.webp',
  },
  {
    key: 'toBosses',
    name: 'Damage to Bosses',
    short: 'Boss',
    icon: 'https://sio-cdn.exp0.dev/icons/damage_boss.webp',
  },
]

export const STAT_KEYS: StatKey[] = STATS.map((s) => s.key)

export const STAT_META: Record<StatKey, StatMeta> = Object.fromEntries(
  STATS.map((s) => [s.key, s]),
) as Record<StatKey, StatMeta>

export function zeroStats(): StatTotals {
  return {
    critDamage: 0,
    skillDamage: 0,
    shieldDamage: 0,
    toWeakened: 0,
    toPoisoned: 0,
    toChilled: 0,
    laceration: 0,
    toBosses: 0,
  }
}
