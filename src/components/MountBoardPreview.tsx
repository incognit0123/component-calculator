import { QUALITY_META } from '../data/qualities'
import { SHAPE_ROTATIONS } from '../data/shapes'
import type { Piece } from '../data/types'
import { BOARD_ROWS } from '../optimizer/types'
import type { Placement } from '../optimizer/types'
import { darken, piecePath } from './pieceGeometry'
import type { Cell } from './pieceGeometry'

const GRID_BG = '#181b2c'
const GRID_LINE = '#0d0f1c'

interface Props {
  pieces: Piece[]
  placements: Placement[]
  cols: number
  /** Whether this preview is the one shown in the main board view. */
  active: boolean
  onClick: () => void
  label: string
  cellSize?: number
}

/**
 * Compact, simplified version of `BoardView`: same piece outlines/colors but
 * no diamonds, stat icons, or full-row highlights. Used for the row of mount
 * thumbnails under the main board view.
 */
export function MountBoardPreview({
  pieces,
  placements,
  cols,
  active,
  onClick,
  label,
  cellSize = 9,
}: Props) {
  const pieceById = new Map(pieces.map((p) => [p.id, p]))

  type Render = { id: string; cells: Cell[]; main: string; dark: string }
  const renders: Render[] = []
  for (const pl of placements) {
    const piece = pieceById.get(pl.pieceId)
    if (!piece) continue
    const meta = QUALITY_META[piece.quality]
    const cells: Cell[] = SHAPE_ROTATIONS[piece.shape][pl.rotation].map(
      ([dr, dc]) => [pl.row + dr, pl.col + dc] as Cell,
    )
    renders.push({
      id: pl.pieceId,
      cells,
      main: meta.color,
      dark: darken(meta.color, 0.62),
    })
  }

  const boardWidth = cols * cellSize
  const boardHeight = BOARD_ROWS * cellSize
  const outerInset = Math.max(1, Math.round(cellSize * 0.09))
  const bandWidth = Math.max(1, Math.round(cellSize * 0.13))
  const innerInset = outerInset + bandWidth
  const cornerR = Math.max(1, Math.round(cellSize * 0.18))
  const innerCornerR = Math.max(1, cornerR - bandWidth)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex flex-col items-center gap-1 rounded-md p-1 transition focus:outline-none focus:ring-1 focus:ring-accent ${
        active
          ? 'ring-2 ring-accent bg-bg-elev/60'
          : 'hover:bg-bg-elev/40 opacity-80 hover:opacity-100'
      }`}
    >
      <svg
        width={boardWidth}
        height={boardHeight}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`}
        className="block rounded-sm overflow-hidden"
        shapeRendering="geometricPrecision"
      >
        <rect x={0} y={0} width={boardWidth} height={boardHeight} fill={GRID_BG} />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={(i + 1) * cellSize}
            y1={0}
            x2={(i + 1) * cellSize}
            y2={boardHeight}
            stroke={GRID_LINE}
            strokeWidth={0.5}
            shapeRendering="crispEdges"
          />
        ))}
        {Array.from({ length: BOARD_ROWS - 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={(i + 1) * cellSize}
            x2={boardWidth}
            y2={(i + 1) * cellSize}
            stroke={GRID_LINE}
            strokeWidth={0.5}
            shapeRendering="crispEdges"
          />
        ))}
        {renders.map((r) => (
          <g key={r.id}>
            <path
              d={piecePath(r.cells, cellSize, outerInset, cornerR)}
              fill={r.dark}
            />
            <path
              d={piecePath(r.cells, cellSize, innerInset, innerCornerR)}
              fill={r.main}
            />
          </g>
        ))}
      </svg>
      <span
        className={`text-[10px] truncate max-w-[140px] ${
          active ? 'text-white' : 'text-gray-400'
        }`}
      >
        {label}
      </span>
    </button>
  )
}
