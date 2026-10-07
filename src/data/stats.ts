import type { StatKey, StatTotals } from './types'
import critDamageIcon from '../assets/icons/pets/skills/inspiration.webp'
import skillDamageIcon from '../assets/icons/pets/skills/encouragement.webp'
import shieldDamageIcon from '../assets/icons/pets/skills/shield_damage.webp'
import weakenedIcon from '../assets/icons/pets/skills/weakened.webp'
import poisonedIcon from '../assets/icons/pets/skills/poisoned.webp'
import chilledIcon from '../assets/icons/pets/skills/chilled.webp'
import lacerationIcon from '../assets/icons/stats/laceration.webp'
import bossesIcon from '../assets/icons/damage_boss.webp'

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
    icon: critDamageIcon,
  },
  {
    key: 'skillDamage',
    name: 'Skill Damage',
    short: 'Skill',
    icon: skillDamageIcon,
  },
  {
    key: 'shieldDamage',
    name: 'Shield Damage',
    short: 'Shield',
    icon: shieldDamageIcon,
  },
  {
    key: 'toWeakened',
    name: 'Damage to Weakened',
    short: 'Weakened',
    icon: weakenedIcon,
  },
  {
    key: 'toPoisoned',
    name: 'Damage to Poisoned',
    short: 'Poisoned',
    icon: poisonedIcon,
  },
  {
    key: 'toChilled',
    name: 'Damage to Chilled',
    short: 'Chilled',
    icon: chilledIcon,
  },
  {
    key: 'laceration',
    name: 'Laceration',
    short: 'Lacer.',
    icon: lacerationIcon,
  },
  {
    key: 'toBosses',
    name: 'Damage to Bosses',
    short: 'Boss',
    icon: bossesIcon,
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

/**
 * Preference order among the three debuff-conditional stats, which share one
 * additive damage pool. When options score equally, prefer the stat that is
 * easiest to apply in practice: chilled, then poisoned, then weakened.
 */
export const DEBUFF_PRIORITY: StatKey[] = ['toChilled', 'toPoisoned', 'toWeakened']

/** Rank of a stat for tie-breaking: lower is preferred; non-debuffs sort last. */
export function debuffRank(stat: StatKey): number {
  const i = DEBUFF_PRIORITY.indexOf(stat)
  return i === -1 ? DEBUFF_PRIORITY.length : i
}
