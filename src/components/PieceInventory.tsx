import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Piece } from '../data/types'
import { PieceCard } from './PieceCard'
import { PieceEditor } from './PieceEditor'
import { PanelShell } from './PanelShell'

interface Props {
  pieces: Piece[]
  onChange: (pieces: Piece[]) => void
  unusedIds?: Set<string>
}

export function PieceInventory({ pieces, onChange, unusedIds }: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Piece | null>(null)

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pieces.map((p) => (
            <PieceCard
              key={p.id}
              piece={p}
              dim={unusedIds?.has(p.id)}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
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
