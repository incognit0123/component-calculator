import { STATS } from '../data/stats'
import type { StatTotals } from '../data/types'
import { StatIcon } from './icons/StatIcon'

interface Props {
  stats: StatTotals
  onChange: (stats: StatTotals) => void
  onReset: () => void
}

export function CurrentStatsPanel({ stats, onChange, onReset }: Props) {
  return (
    <section className="bg-bg-panel border border-bg-line rounded-xl p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Your current stats</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Reset to 0
        </button>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <label
            key={stat.key}
            className="flex flex-col gap-1 bg-bg-elev rounded-lg p-3 border border-bg-line"
          >
            <span className="flex items-center gap-2 text-xs text-gray-300">
              <StatIcon stat={stat.key} size={20} />
              <span className="truncate">{stat.name}</span>
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={Number.isFinite(stats[stat.key]) ? stats[stat.key] : 0}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  onChange({
                    ...stats,
                    [stat.key]: Number.isFinite(v) && v >= 0 ? v : 0,
                  })
                }}
                className="w-full bg-bg-panel border border-bg-line rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-accent"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  )
}
