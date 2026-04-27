import type { ShapeKey } from '../../data/types'
import { SHAPE_ROTATIONS, shapeBounds } from '../../data/shapes'
import { darken, piecePath } from '../pieceGeometry'
import type { Cell } from '../pieceGeometry'

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
  const cells = SHAPE_ROTATIONS[shape][0] as readonly Cell[]
  const { rows, cols } = shapeBounds(cells)
  const w = cols * cell
  const h = rows * cell
  const dark = darken(color, 0.62)

  const outerInset = Math.max(0.5, cell * 0.1)
  const bandWidth = Math.max(1, cell * 0.16)
  const innerInset = outerInset + bandWidth
  const cornerR = Math.max(1, cell * 0.2)
  const innerCornerR = Math.max(0.5, cornerR - bandWidth)
  const diamondHalf = Math.max(1, cell * 0.16)

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-label={`${shape} piece`}
      shapeRendering="geometricPrecision"
    >
      <path d={piecePath(cells, cell, outerInset, cornerR)} fill={dark} />
      <path
        d={piecePath(cells, cell, innerInset, innerCornerR)}
        fill={color}
      />
      {diamondColor &&
        cells.map(([r, c], i) => {
          const cx = c * cell + cell / 2
          const cy = r * cell + cell / 2
          return (
            <polygon
              key={i}
              points={`${cx},${cy - diamondHalf} ${cx + diamondHalf},${cy} ${cx},${cy + diamondHalf} ${cx - diamondHalf},${cy}`}
              fill={diamondColor}
            />
          )
        })}
    </svg>
  )
}
