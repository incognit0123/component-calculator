import type { QualityTier } from './types'

export interface QualityMeta {
  key: QualityTier
  name: string
  color: string
  diamond: boolean
  diamondColor?: string
}

export const QUALITIES: QualityMeta[] = [
  { key: 'good', name: 'Good', color: '#60cb00', diamond: false },
  { key: 'better', name: 'Better', color: '#4a93e8', diamond: false },
  { key: 'excellent', name: 'Excellent', color: '#DB25FF', diamond: false },
  {
    key: 'excellentPlus',
    name: 'Excellent+1',
    color: '#DB25FF',
    diamond: true,
    diamondColor: '#ED92FF',
  },
  { key: 'epic', name: 'Epic', color: '#FCCF0A', diamond: false },
  {
    key: 'epicPlus',
    name: 'Epic+1',
    color: '#FCCF0A',
    diamond: true,
    diamondColor: '#FFE584',
  },
  { key: 'legend', name: 'Legend', color: '#FE4C6A', diamond: false },
]

export const QUALITY_META: Record<QualityTier, QualityMeta> = Object.fromEntries(
  QUALITIES.map((q) => [q.key, q]),
) as Record<QualityTier, QualityMeta>
