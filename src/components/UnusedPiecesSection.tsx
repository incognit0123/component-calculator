import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Piece } from '../data/types'
import { PieceCard } from './PieceCard'
import { PieceCountSummary } from './PieceCountSummary'

/**
 * Pieces the optimizer didn't place. Collapsed by default to a count plus a
 * per-stat summary, since the full list is rarely useful and takes a lot of
 * space; expands to the individual (dimmed) cards.
 */
export function UnusedPiecesSection({ pieces }: { pieces: Piece[] }) {
  const [collapsed, setCollapsed] = useState(true)
  if (pieces.length === 0) return null
  const label = `${pieces.length} unused piece${pieces.length === 1 ? '' : 's'}`

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Unused pieces</h3>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand unused pieces' : 'Collapse unused pieces'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand unused pieces' : 'Collapse unused pieces'}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#151922] bg-[#2f354a] text-gray-300 hover:bg-[#3b435d] hover:text-white transition"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {collapsed ? (
        <div className="panel-inner p-3 flex flex-col gap-3">
          <span className="text-sm text-white">{label}</span>
          <PieceCountSummary pieces={pieces} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {pieces.map((piece) => (
            <PieceCard key={piece.id} piece={piece} dim />
          ))}
        </div>
      )}

      <div className="flex justify-center mt-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 rounded-full border border-[#151922] bg-[#2f354a] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#3b435d] hover:text-white transition"
        >
          {collapsed ? (
            <>
              <ChevronDown size={14} />
              Show all {label}
            </>
          ) : (
            <>
              <ChevronUp size={14} />
              Hide unused pieces
            </>
          )}
        </button>
      </div>
    </div>
  )
}
