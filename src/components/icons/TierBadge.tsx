import type { QualityTier } from '../../data/types'
import { QUALITY_META } from '../../data/qualities'

interface Props {
  tier: QualityTier
  size?: 'sm' | 'md'
  className?: string
}

export function TierBadge({ tier, size = 'md', className }: Props) {
  const meta = QUALITY_META[tier]
  const base =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5'
      : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold text-white/95 ${base} ${className ?? ''}`}
      style={{
        background: meta.color + 'cc',
        boxShadow: `inset 0 0 0 1px ${meta.color}`,
      }}
    >
      {meta.diamond ? (
        <span
          aria-hidden
          className="inline-block"
          style={{
            width: size === 'sm' ? 6 : 7,
            height: size === 'sm' ? 6 : 7,
            background: '#fff',
            transform: 'rotate(45deg)',
            borderRadius: 1,
          }}
        />
      ) : null}
      {meta.name}
    </span>
  )
}
