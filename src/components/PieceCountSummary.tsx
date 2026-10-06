import { STATS } from '../data/stats'
import type { Piece, StatKey } from '../data/types'
import { StatIcon } from './icons/StatIcon'

/** One chip per stat that has pieces, showing how many. */
export function PieceCountSummary({ pieces }: { pieces: Piece[] }) {
  const counts = pieces.reduce(
    (acc, p) => {
      acc[p.stat] = (acc[p.stat] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<StatKey, number>>,
  )

  return (
    <div className="flex flex-wrap gap-2">
      {STATS.filter((st) => (counts[st.key] ?? 0) > 0).map((st) => (
        <span
          key={st.key}
          className="flex items-center gap-1.5 rounded-full border border-bg-line bg-bg-elev px-2 py-1 text-xs text-gray-200"
          title={st.short}
        >
          <StatIcon stat={st.key} size={16} />
          {st.short}
          <span className="text-white font-semibold tabular-nums">
            {counts[st.key]}
          </span>
        </span>
      ))}
    </div>
  )
}
