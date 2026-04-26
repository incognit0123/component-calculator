import { BOARD_COLS, BOARD_ROWS } from '../optimizer/types'
import type { Placement } from '../optimizer/types'
import type { Piece } from '../data/types'
import { SHAPE_ROTATIONS } from '../data/shapes'
import { QUALITY_META } from '../data/qualities'
import { STAT_META } from '../data/stats'
import { BUFF_TABLE } from '../data/buffTable'
import { fullRowsMask } from '../optimizer/board'

interface Props {
  pieces: Piece[]
  placements: Placement[]
  cellSize?: number
}

interface CellInfo {
  pieceId: string
  role: 'origin' | 'body'
}

export function BoardView({ pieces, placements, cellSize = 44 }: Props) {
  const pieceById = new Map(pieces.map((p) => [p.id, p]))
  const grid: (CellInfo | null)[][] = Array.from({ length: BOARD_ROWS }, () =>
    Array(BOARD_COLS).fill(null),
  )
  let occ = 0n

  for (const pl of placements) {
    const piece = pieceById.get(pl.pieceId)
    if (!piece) continue
    const cells = SHAPE_ROTATIONS[piece.shape][pl.rotation]
    let first = true
    for (const [dr, dc] of cells) {
      const r = pl.row + dr
      const c = pl.col + dc
      grid[r][c] = {
        pieceId: pl.pieceId,
        role: first ? 'origin' : 'body',
      }
      occ |= 1n << BigInt(r * BOARD_COLS + c)
      first = false
    }
  }

  const rowMask = fullRowsMask(occ)

  const samePieceAt = (r: number, c: number, pieceId: string) => {
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) return false
    const cell = grid[r][c]
    return cell != null && cell.pieceId === pieceId
  }

  const boardWidth = BOARD_COLS * cellSize
  const boardHeight = BOARD_ROWS * cellSize
  const diamondSize = Math.round(cellSize * 0.22)

  return (
    <div className="p-2 rounded-lg bg-bg-elev border border-bg-line">
      <div
        className="relative"
        style={{ width: boardWidth, height: boardHeight }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${BOARD_ROWS}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: BOARD_ROWS }).flatMap((_, r) =>
            Array.from({ length: BOARD_COLS }).map((__, c) => {
              const cell = grid[r][c]
              const piece = cell ? pieceById.get(cell.pieceId) : null
              const meta = piece ? QUALITY_META[piece.quality] : null
              const color = meta?.color
              const diamondColor = meta?.diamondColor

              const shadows: string[] = []
              if (cell && color) {
                if (!samePieceAt(r - 1, c, cell.pieceId))
                  shadows.push(`inset 0 1px 0 0 ${color}`)
                if (!samePieceAt(r + 1, c, cell.pieceId))
                  shadows.push(`inset 0 -1px 0 0 ${color}`)
                if (!samePieceAt(r, c - 1, cell.pieceId))
                  shadows.push(`inset 1px 0 0 0 ${color}`)
                if (!samePieceAt(r, c + 1, cell.pieceId))
                  shadows.push(`inset -1px 0 0 0 ${color}`)
              } else {
                shadows.push('inset 0 0 0 1px rgba(255,255,255,0.05)')
              }

              return (
                <div
                  key={`${r},${c}`}
                  className={`relative ${piece ? '' : 'bg-bg-panel/60'}`}
                  style={{
                    background: piece ? color + '55' : undefined,
                    boxShadow: shadows.join(', '),
                  }}
                  title={
                    piece
                      ? `${STAT_META[piece.stat].name} +${BUFF_TABLE[piece.quality][piece.stat]}%`
                      : undefined
                  }
                >
                  {diamondColor && (
                    <div
                      aria-hidden
                      className="absolute pointer-events-none"
                      style={{
                        width: diamondSize,
                        height: diamondSize,
                        background: diamondColor,
                        transform: 'rotate(45deg)',
                        top: 4,
                        left: 4,
                        borderRadius: 1,
                      }}
                    />
                  )}
                  {cell?.role === 'origin' && piece && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <img
                        src={STAT_META[piece.stat].icon}
                        alt={STAT_META[piece.stat].name}
                        style={{
                          width: Math.min(cellSize - 8, 28),
                          height: Math.min(cellSize - 8, 28),
                        }}
                        draggable={false}
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
              )
            }),
          )}
        </div>
        {Array.from({ length: BOARD_ROWS }).map((_, r) => {
          const rowFull = (rowMask & (1 << r)) !== 0
          if (!rowFull) return null
          return (
            <div
              key={`row-${r}`}
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                top: r * cellSize,
                left: 0,
                width: boardWidth,
                height: cellSize,
                outline: '2px solid rgba(234,179,8,0.9)',
                outlineOffset: '-1px',
                borderRadius: 2,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
