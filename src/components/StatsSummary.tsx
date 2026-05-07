import { STATS } from '../data/stats'
import type { StatTotals } from '../data/types'
import { StatIcon } from './icons/StatIcon'

export type SecondaryColumnKind = 'lines' | 'syncRate'

export interface StatsTab {
  id: string
  label: string
}

interface Props {
  currentStats: StatTotals
  buffsFromPieces: StatTotals
  /** Values for the rightmost contribution column (line bonuses or sync-scaled). */
  secondaryValues: StatTotals
  secondaryKind: SecondaryColumnKind
  secondaryLabel: string
  /** Round contribution columns to 2 decimals (used in the All-mounts view). */
  roundContributions?: boolean
  /** Tabs to render above the table. Hidden when undefined or length<=1. */
  tabs?: StatsTab[]
  activeTabId?: string
  onTabChange?: (id: string) => void
}

function fmt(n: number, dp: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n) && dp <= 1) return n.toString()
  return n.toFixed(dp)
}

export function StatsSummary({
  currentStats,
  buffsFromPieces,
  secondaryValues,
  secondaryKind,
  secondaryLabel,
  roundContributions,
  tabs,
  activeTabId,
  onTabChange,
}: Props) {
  const dp = roundContributions ? 2 : 1
  const secondaryColor =
    secondaryKind === 'lines' ? 'text-yellow-400' : 'text-sky-400/70'

  return (
    <div className="flex flex-col gap-3">
      {tabs && tabs.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                aria-pressed={active}
                className={`text-xs px-3 py-1 rounded-full transition border ${
                  active
                    ? 'bg-accent text-bg border-accent font-semibold'
                    : 'border-bg-line text-gray-300 hover:border-gray-500 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-2 py-1 font-normal">Stat</th>
              <th className="text-right px-2 py-1 font-normal">Before</th>
              <th className="text-right px-2 py-1 font-normal">+ Pieces</th>
              <th className="text-right px-2 py-1 font-normal">{secondaryLabel}</th>
              <th className="text-right px-2 py-1 font-normal">After</th>
            </tr>
          </thead>
          <tbody>
            {STATS.map((s) => {
              const before = currentStats[s.key]
              const piece = buffsFromPieces[s.key]
              const secondary = secondaryValues[s.key]
              const after = before + piece + secondary
              return (
                <tr key={s.key} className="border-t border-bg-line">
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <StatIcon stat={s.key} size={18} />
                      <span className="text-gray-200">{s.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400">
                    {fmt(before, 1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right text-accent">
                    {piece > 0 ? `+${fmt(piece, dp)}%` : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right ${secondaryColor}`}>
                    {secondary > 0 ? `+${fmt(secondary, dp)}%` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right text-white font-medium">
                    {fmt(after, dp)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
