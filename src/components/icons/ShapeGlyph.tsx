import type { ShapeKey } from '../../data/types'
import { SHAPE_ROTATIONS, shapeBounds } from '../../data/shapes'

interface Props {
  shape: ShapeKey
  color?: string
  diamondColor?: string
  cell?: number
  className?: string
}

export function ShapeGlyph({
  shape,
  color = '#8b5cf6',
  diamondColor,
  cell = 10,
  className,
}: Props) {
  const cells = SHAPE_ROTATIONS[shape][0]
  const { rows, cols } = shapeBounds(cells)
  const w = cols * cell
  const h = rows * cell
  const diamondHalf = cell * 0.22
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-label={`${shape} piece`}
    >
      {cells.map(([r, c], i) => {
        const x = c * cell
        const y = r * cell
        const cx = x + cell / 2
        const cy = y + cell / 2
        return (
          <g key={i}>
            <rect
              x={x + 1}
              y={y + 1}
              width={cell - 2}
              height={cell - 2}
              rx={1.5}
              fill={color}
            />
            {diamondColor && (
              <polygon
                points={`${cx},${cy - diamondHalf} ${cx + diamondHalf},${cy} ${cx},${cy + diamondHalf} ${cx - diamondHalf},${cy}`}
                fill={diamondColor}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
