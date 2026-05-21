import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Dropdown } from 'antd'
import { v4 as uuid } from 'uuid'
import type { Piece, StatTotals } from '../data/types'
import { sortByMarginalGain, sortByQualityShape } from '../utils/sortPieces'
import { PieceCard } from './PieceCard'
import { PieceEditor } from './PieceEditor'
import { PanelShell } from './PanelShell'

interface Props {
  pieces: Piece[]
  currentStats: StatTotals
  onChange: (pieces: Piece[]) => void
  unusedIds?: Set<string>
}

interface SortableCardProps {
  piece: Piece
  dim?: boolean
  onEdit: () => void
  onDelete: () => void
}

function SortablePieceCard({ piece, dim, onEdit, onDelete }: SortableCardProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: piece.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <PieceCard
        piece={piece}
        dim={dim}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandle={{
          setRef: setActivatorNodeRef,
          attributes,
          listeners,
        }}
        isDragging={isDragging}
      />
    </div>
  )
}

export function PieceInventory({
  pieces,
  currentStats,
  onChange,
  unusedIds,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Piece | null>(null)

  // Small drag-activation distance avoids triggering drags on stray click
  // motion while the user is reaching for the grip handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const openAdd = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (p: Piece) => {
    setEditing(p)
    setEditorOpen(true)
  }

  const handleSave = (draft: Omit<Piece, 'id'>) => {
    if (editing) {
      onChange(pieces.map((p) => (p.id === editing.id ? { ...editing, ...draft } : p)))
    } else {
      onChange([...pieces, { id: uuid(), ...draft }])
    }
    setEditorOpen(false)
  }

  const handleDelete = (id: string) =>
    onChange(pieces.filter((p) => p.id !== id))

  const handleClear = () => {
    if (pieces.length === 0) return
    if (
      window.confirm(`Clear all ${pieces.length} piece${pieces.length === 1 ? '' : 's'}?`)
    ) {
      onChange([])
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = pieces.findIndex((p) => p.id === active.id)
    const to = pieces.findIndex((p) => p.id === over.id)
    if (from === -1 || to === -1) return
    onChange(arrayMove(pieces, from, to))
  }

  const handleSortByQuality = () => {
    onChange(sortByQualityShape(pieces))
  }
  const handleSortByGain = () => {
    onChange(sortByMarginalGain(pieces, currentStats))
  }

  const sortDisabled = pieces.length < 2
  const sortMenuItems = [
    {
      key: 'quality',
      label: 'By quality',
      onClick: handleSortByQuality,
    },
    {
      key: 'gain',
      label: 'By marginal gain',
      onClick: handleSortByGain,
    },
  ]

  const pieceIds = pieces.map((p) => p.id)

  return (
    <PanelShell title="Inventory">
      <header className="flex items-center justify-end -mt-2 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={pieces.length === 0}
            className="text-xs text-gray-400 hover:text-red-400 disabled:opacity-40 disabled:hover:text-gray-400"
          >
            Clear all
          </button>
          <Dropdown
            menu={{ items: sortMenuItems }}
            trigger={['click']}
            disabled={sortDisabled}
          >
            <button
              type="button"
              disabled={sortDisabled}
              className="app-button bg-[#2f354a] hover:bg-[#3b435d] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sort ▾
            </button>
          </Dropdown>
          <button
            type="button"
            onClick={openAdd}
            className="app-button"
          >
            + Add piece
          </button>
        </div>
      </header>

      {pieces.length === 0 ? (
        <p className="panel-inner text-sm text-gray-400 py-6 text-center">
          No pieces yet. Click <span className="text-white">Add piece</span> to build your inventory.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={pieceIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pieces.map((p) => (
                <SortablePieceCard
                  key={p.id}
                  piece={p}
                  dim={unusedIds?.has(p.id)}
                  onEdit={() => openEdit(p)}
                  onDelete={() => handleDelete(p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <PieceEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </PanelShell>
  )
}
