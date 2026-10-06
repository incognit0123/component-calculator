import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { BUFF_TABLE } from '../data/buffTable'
import { QUALITIES, QUALITY_META } from '../data/qualities'
import { SHAPE_KEYS } from '../data/shapes'
import { STATS, STAT_META } from '../data/stats'
import type { Piece, QualityTier, ShapeKey, StatKey } from '../data/types'
import { ShapeGlyph } from './icons/ShapeGlyph'
import { StatIcon } from './icons/StatIcon'
import { TierBadge } from './icons/TierBadge'

interface Props {
  open: boolean
  pieces: Piece[]
  onClose: () => void
  onApply: (pieces: Piece[]) => void
}

const MAX_COUNT = 99

type Counts = Record<string, number>

const cellKey = (stat: StatKey, quality: QualityTier, shape: ShapeKey) =>
  `${stat}|${quality}|${shape}`

function countPieces(pieces: Piece[]): Counts {
  const counts: Counts = {}
  for (const p of pieces) {
    const k = cellKey(p.stat, p.quality, p.shape)
    counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}

/**
 * Reconcile the inventory with the edited counts. Cells whose count is
 * unchanged keep their pieces (ids + order) untouched; increases append new
 * pieces; decreases drop the most recently added pieces of that kind.
 */
function applyCounts(pieces: Piece[], draft: Counts): Piece[] {
  const remaining: Counts = { ...draft }
  const kept: Piece[] = []
  for (const p of pieces) {
    const k = cellKey(p.stat, p.quality, p.shape)
    if ((remaining[k] ?? 0) > 0) {
      remaining[k] -= 1
      kept.push(p)
    }
  }
  const added: Piece[] = []
  for (const stat of STATS) {
    for (const q of QUALITIES) {
      for (const shape of SHAPE_KEYS) {
        const n = remaining[cellKey(stat.key, q.key, shape)] ?? 0
        for (let i = 0; i < n; i++) {
          added.push({ id: uuid(), shape, quality: q.key, stat: stat.key })
        }
      }
    }
  }
  return [...kept, ...added]
}

export function BulkPieceEditor({ open, pieces, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<Counts>({})
  const [stat, setStat] = useState<StatKey>('critDamage')

  useEffect(() => {
    if (!open) return
    setDraft(countPieces(pieces))
    // Only re-seed when the modal opens, not on every inventory change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const statTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const [k, n] of Object.entries(draft)) {
      const s = k.split('|')[0]
      totals[s] = (totals[s] ?? 0) + n
    }
    return totals
  }, [draft])
  const grandTotal = Object.values(statTotals).reduce((a, b) => a + b, 0)

  if (!open) return null

  const setCount = (k: string, n: number) =>
    setDraft((d) => ({ ...d, [k]: Math.max(0, Math.min(MAX_COUNT, n)) }))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Bulk edit inventory</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-400 -mt-2">
          Pick a stat, then enter how many pieces of each shape and quality you
          own. Counts start from your current inventory; nothing changes until
          you press Apply.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStat(s.key)}
              aria-pressed={stat === s.key}
              className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left transition ${
                stat === s.key
                  ? 'border-accent bg-[#404458]'
                  : 'border-bg-line bg-transparent hover:border-accent/50'
              }`}
            >
              <StatIcon stat={s.key} size={22} />
              <span className="text-xs text-white truncate flex-1">{s.short}</span>
              {(statTotals[s.key] ?? 0) > 0 && (
                <span className="text-[10px] rounded-full bg-accent/80 text-white px-1.5">
                  {statTotals[s.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-400 font-normal pl-1">
                  {STAT_META[stat].name}
                </th>
                {SHAPE_KEYS.map((shape) => (
                  <th key={shape} className="text-xs text-gray-400 font-normal">
                    {shape}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUALITIES.map((q) => {
                const meta = QUALITY_META[q.key]
                return (
                  <tr key={q.key}>
                    <td className="pr-2">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={q.key} />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: meta.color }}
                        >
                          +{BUFF_TABLE[q.key][stat]}%
                        </span>
                      </div>
                    </td>
                    {SHAPE_KEYS.map((shape) => {
                      const k = cellKey(stat, q.key, shape)
                      const n = draft[k] ?? 0
                      return (
                        <td key={shape} className="px-1">
                          <div className="flex flex-col items-center gap-1">
                            <ShapeGlyph
                              shape={shape}
                              color={meta.color}
                              diamondColor={meta.diamondColor}
                              cell={8}
                            />
                            <div className="flex items-center">
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-label={`Decrease ${q.key} ${shape}`}
                                onClick={() => setCount(k, n - 1)}
                                className="h-7 w-6 flex items-center justify-center rounded-l border border-bg-line text-gray-300 hover:bg-bg-elev"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={MAX_COUNT}
                                value={n === 0 ? '' : n}
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  setCount(k, parseInt(e.target.value, 10) || 0)
                                }
                                aria-label={`${q.key} ${shape} count`}
                                className={`h-7 w-10 text-center text-sm bg-transparent border-y border-bg-line outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                                  n > 0 ? 'text-white font-semibold' : 'text-gray-400'
                                }`}
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-label={`Increase ${q.key} ${shape}`}
                                onClick={() => setCount(k, n + 1)}
                                className="h-7 w-6 flex items-center justify-center rounded-r border border-bg-line text-gray-300 hover:bg-bg-elev"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400">
            {grandTotal} piece{grandTotal === 1 ? '' : 's'} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-bg-line text-gray-300 hover:text-white hover:bg-bg-elev"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(applyCounts(pieces, draft))
                onClose()
              }}
              className="px-3 py-1.5 rounded-md bg-accent text-white font-semibold hover:bg-accent/90"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
