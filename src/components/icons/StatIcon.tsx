import type { StatKey } from '../../data/types'
import { STAT_META } from '../../data/stats'

interface Props {
  stat: StatKey
  size?: number
  className?: string
  title?: string
}

export function StatIcon({ stat, size = 24, className, title }: Props) {
  const meta = STAT_META[stat]
  return (
    <img
      src={meta.icon}
      alt={meta.name}
      title={title ?? meta.name}
      className={className}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
      loading="lazy"
    />
  )
}
