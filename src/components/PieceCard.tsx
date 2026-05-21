import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import type { Piece } from '../data/types'
import { QUALITY_META } from '../data/qualities'
import { BUFF_TABLE } from '../data/buffTable'
import { STAT_META } from '../data/stats'
import { ShapeGlyph } from './icons/ShapeGlyph'
import { StatIcon } from './icons/StatIcon'

export interface PieceCardDragHandle {
  setRef: (node: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

interface Props {
  piece: Piece
  onEdit?: () => void
  onDelete?: () => void
  dim?: boolean
  dragHandle?: PieceCardDragHandle
  isDragging?: boolean
}

export function PieceCard({
  piece,
  onEdit,
  onDelete,
  dim,
  dragHandle,
  isDragging,
}: Props) {
  const meta = QUALITY_META[piece.quality]
  const color = meta.color
  const buff = BUFF_TABLE[piece.quality][piece.stat]
  const stat = STAT_META[piece.stat]
  return (
    <div
      className={`panel-inner p-3 flex flex-col gap-2 ${
        dim ? 'opacity-50' : ''
      } ${isDragging ? 'opacity-60 shadow-lg' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="rounded-md p-1.5 flex items-center justify-center"
          style={{ background: '#3a3d4d', border: '2px solid #151922' }}
        >
          <ShapeGlyph
            shape={piece.shape}
            color={color}
            diamondColor={meta.diamondColor}
            cell={9}
          />
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-bg-line"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-bg-line"
            >
              ✕
            </button>
          )}
          {dragHandle && (
            <button
              type="button"
              ref={dragHandle.setRef}
              {...dragHandle.attributes}
              {...dragHandle.listeners}
              aria-label="Drag to reorder"
              className="text-gray-500 hover:text-gray-200 p-0.5 rounded touch-none cursor-grab active:cursor-grabbing"
            >
              <GripVertical size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatIcon stat={piece.stat} size={22} />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-white text-sm break-words">{stat.name}</span>
          <span className="text-xs" style={{ color }}>
            +{buff}%
          </span>
        </div>
      </div>
    </div>
  )
}
