import { STATS } from '../data/stats'
import type { StatTotals } from '../data/types'
import { StatIcon } from './icons/StatIcon'

interface Props {
  currentStats: StatTotals
  buffsFromPieces: StatTotals
  buffsFromLines: StatTotals
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(1)
}

export function StatsSummary({
  currentStats,
  buffsFromPieces,
  buffsFromLines,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs">
            <th className="text-left px-2 py-1 font-normal">Stat</th>
            <th className="text-right px-2 py-1 font-normal">Before</th>
            <th className="text-right px-2 py-1 font-normal">+ Pieces</th>
            <th className="text-right px-2 py-1 font-normal">+ Lines</th>
            <th className="text-right px-2 py-1 font-normal">After</th>
          </tr>
        </thead>
        <tbody>
          {STATS.map((s) => {
            const before = currentStats[s.key]
            const piece = buffsFromPieces[s.key]
            const line = buffsFromLines[s.key]
            const after = before + piece + line
            return (
              <tr key={s.key} className="border-t border-bg-line">
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <StatIcon stat={s.key} size={18} />
                    <span className="text-gray-200">{s.name}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-gray-400">
                  {fmt(before)}%
                </td>
                <td className="px-2 py-1.5 text-right text-accent">
                  {piece > 0 ? `+${fmt(piece)}%` : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-yellow-400">
                  {line > 0 ? `+${fmt(line)}%` : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-white font-medium">
                  {fmt(after)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
