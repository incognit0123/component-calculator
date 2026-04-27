import { BOARD_COLS, BOARD_ROWS } from '../optimizer/types'
import type { Placement } from '../optimizer/types'
import type { Piece, StatKey } from '../data/types'
import { SHAPE_ROTATIONS } from '../data/shapes'
import { QUALITY_META } from '../data/qualities'
import { STAT_META } from '../data/stats'
import { BUFF_TABLE } from '../data/buffTable'
import { fullRowsMask } from '../optimizer/board'
import { darken, piecePath } from './pieceGeometry'
import type { Cell } from './pieceGeometry'

const GRID_BG = '#181b2c'
const GRID_LINE = '#0d0f1c'
const FULL_ROW_FILL = '#facc15'

interface Props {
  pieces: Piece[]
  placements: Placement[]
  cellSize?: number
}

interface PieceRender {
  pieceId: string
  cells: Cell[]
  origin: Cell
  main: string
  dark: string
  diamond?: string
  stat: StatKey
  buff: number
}

export function BoardView({ pieces, placements, cellSize = 44 }: Props) {
  const pieceById = new Map(pieces.map((p) => [p.id, p]))

  const piecesToRender: PieceRender[] = []
  let occ = 0n
  for (const pl of placements) {
    const piece = pieceById.get(pl.pieceId)
    if (!piece) continue
    const meta = QUALITY_META[piece.quality]
    const shapeCells = SHAPE_ROTATIONS[piece.shape][pl.rotation]
    const cells: Cell[] = shapeCells.map(
      ([dr, dc]) => [pl.row + dr, pl.col + dc] as Cell,
    )
    for (const [r, c] of cells) {
      occ |= 1n << BigInt(r * BOARD_COLS + c)
    }
    piecesToRender.push({
      pieceId: pl.pieceId,
      cells,
      origin: cells[0],
      main: meta.color,
      dark: darken(meta.color, 0.62),
      diamond: meta.diamondColor,
      stat: piece.stat,
      buff: BUFF_TABLE[piece.quality][piece.stat],
    })
  }

  const rowMask = fullRowsMask(occ)

  const boardWidth = BOARD_COLS * cellSize
  const boardHeight = BOARD_ROWS * cellSize
  const outerInset = Math.max(2, Math.round(cellSize * 0.09))
  const bandWidth = Math.max(3, Math.round(cellSize * 0.13))
  const innerInset = outerInset + bandWidth
  const cornerR = Math.max(3, Math.round(cellSize * 0.18))
  const innerCornerR = Math.max(2, cornerR - bandWidth)
  const diamondHalf = Math.max(3, Math.round(cellSize * 0.13))
  const iconSize = Math.min(cellSize - 14, 22)

  return (
    <div className="p-2 rounded-xl bg-bg-elev border border-bg-line">
      <svg
        width={boardWidth}
        height={boardHeight}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`}
        className="block rounded-md overflow-hidden"
        shapeRendering="geometricPrecision"
      >
        <rect
          x={0}
          y={0}
          width={boardWidth}
          height={boardHeight}
          fill={GRID_BG}
        />
        {Array.from({ length: BOARD_COLS - 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={(i + 1) * cellSize}
            y1={0}
            x2={(i + 1) * cellSize}
            y2={boardHeight}
            stroke={GRID_LINE}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ))}
        {Array.from({ length: BOARD_ROWS }).map((_, i) =>
          i === 0 ? null : (
            <line
              key={`h-${i}`}
              x1={0}
              y1={i * cellSize}
              x2={boardWidth}
              y2={i * cellSize}
              stroke={GRID_LINE}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ),
        )}

        {Array.from({ length: BOARD_ROWS }).map((_, r) => {
          const rowFull = (rowMask & (1 << r)) !== 0
          if (!rowFull) return null
          return (
            <rect
              key={`yr-${r}`}
              x={0}
              y={r * cellSize}
              width={boardWidth}
              height={cellSize}
              fill={FULL_ROW_FILL}
            />
          )
        })}

        {piecesToRender.map((p) => (
          <g key={p.pieceId}>
            <path
              d={piecePath(p.cells, cellSize, outerInset, cornerR)}
              fill={p.dark}
            />
            <path
              d={piecePath(p.cells, cellSize, innerInset, innerCornerR)}
              fill={p.main}
            />
          </g>
        ))}

        {piecesToRender.flatMap((p) => {
          if (!p.diamond) return []
          return p.cells
            .filter(
              ([r, c]) => !(r === p.origin[0] && c === p.origin[1]),
            )
            .map(([r, c]) => {
              const cx = c * cellSize + cellSize / 2
              const cy = r * cellSize + cellSize / 2
              return (
                <polygon
                  key={`dia-${p.pieceId}-${r}-${c}`}
                  points={`${cx},${cy - diamondHalf} ${cx + diamondHalf},${cy} ${cx},${cy + diamondHalf} ${cx - diamondHalf},${cy}`}
                  fill={p.diamond}
                />
              )
            })
        })}

        {piecesToRender.map((p) => {
          const stat = STAT_META[p.stat]
          const x = p.origin[1] * cellSize + (cellSize - iconSize) / 2
          const y = p.origin[0] * cellSize + (cellSize - iconSize) / 2
          return (
            <image
              key={`icon-${p.pieceId}`}
              href={stat.icon}
              x={x}
              y={y}
              width={iconSize}
              height={iconSize}
              preserveAspectRatio="xMidYMid meet"
            >
              <title>{`${stat.name} +${p.buff}%`}</title>
            </image>
          )
        })}
      </svg>
    </div>
  )
}
