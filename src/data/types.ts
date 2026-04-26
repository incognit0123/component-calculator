export type StatKey =
  | 'critDamage'
  | 'skillDamage'
  | 'shieldDamage'
  | 'toWeakened'
  | 'toPoisoned'
  | 'toChilled'
  | 'laceration'
  | 'toBosses'

export type ShapeKey = 'O' | 'I' | 'T' | 'L' | 'J'

export type QualityTier =
  | 'good'
  | 'better'
  | 'excellent'
  | 'excellentPlus'
  | 'epic'
  | 'epicPlus'
  | 'legend'

export interface Piece {
  id: string
  shape: ShapeKey
  quality: QualityTier
  stat: StatKey
}

export type StatTotals = Record<StatKey, number>

export type OptimizerMode = 'normal' | 'full'
