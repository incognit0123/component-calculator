import type { QualityTier, StatKey } from './types'

export const BUFF_TABLE: Record<QualityTier, Record<StatKey, number>> = {
  good: {
    critDamage: 8,
    skillDamage: 10,
    shieldDamage: 5,
    toWeakened: 10,
    toPoisoned: 10,
    toChilled: 10,
    laceration: 2,
    toBosses: 1,
  },
  better: {
    critDamage: 12,
    skillDamage: 15,
    shieldDamage: 7,
    toWeakened: 15,
    toPoisoned: 15,
    toChilled: 15,
    laceration: 3,
    toBosses: 2,
  },
  excellent: {
    critDamage: 15,
    skillDamage: 19,
    shieldDamage: 9,
    toWeakened: 19,
    toPoisoned: 19,
    toChilled: 19,
    laceration: 4,
    toBosses: 2.5,
  },
  excellentPlus: {
    critDamage: 18,
    skillDamage: 23,
    shieldDamage: 11,
    toWeakened: 23,
    toPoisoned: 23,
    toChilled: 23,
    laceration: 5,
    toBosses: 3,
  },
  epic: {
    critDamage: 22,
    skillDamage: 27,
    shieldDamage: 14,
    toWeakened: 27,
    toPoisoned: 27,
    toChilled: 27,
    laceration: 6,
    toBosses: 3.5,
  },
  epicPlus: {
    critDamage: 28,
    skillDamage: 35,
    shieldDamage: 18,
    toWeakened: 35,
    toPoisoned: 35,
    toChilled: 35,
    laceration: 7,
    toBosses: 4,
  },
  legend: {
    critDamage: 33,
    skillDamage: 42,
    shieldDamage: 21,
    toWeakened: 42,
    toPoisoned: 42,
    toChilled: 42,
    laceration: 8,
    toBosses: 5,
  },
}

export function buffValue(quality: QualityTier, stat: StatKey): number {
  return BUFF_TABLE[quality][stat]
}
