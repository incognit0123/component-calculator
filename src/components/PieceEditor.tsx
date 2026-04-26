import { useEffect, useState } from 'react'
import { BUFF_TABLE } from '../data/buffTable'
import { QUALITIES, QUALITY_META } from '../data/qualities'
import { SHAPE_KEYS } from '../data/shapes'
import { STATS, STAT_META } from '../data/stats'
import type {
  Piece,
  QualityTier,
  ShapeKey,
  StatKey,
} from '../data/types'
import { ShapeGlyph } from './icons/ShapeGlyph'
import { StatIcon } from './icons/StatIcon'
import { TierBadge } from './icons/TierBadge'

interface Props {
  open: boolean
  initial?: Piece | null
  onClose: () => void
  onSave: (draft: Omit<Piece, 'id'>) => void
}

export function PieceEditor({ open, initial, onClose, onSave }: Props) {
  const [shape, setShape] = useState<ShapeKey>(initial?.shape ?? 'O')
  const [quality, setQuality] = useState<QualityTier>(
    initial?.quality ?? 'good',
  )
  const [stat, setStat] = useState<StatKey>(initial?.stat ?? 'critDamage')

  useEffect(() => {
    if (!open) return
    setShape(initial?.shape ?? 'O')
    setQuality(initial?.quality ?? 'good')
    setStat(initial?.stat ?? 'critDamage')
  }, [open, initial])

  if (!open) return null

  const buff = BUFF_TABLE[quality][stat]
  const qualityMeta = QUALITY_META[quality]
  const color = qualityMeta.color
  const diamondColor = qualityMeta.diamondColor

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {initial ? 'Edit piece' : 'Add piece'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs text-gray-400 mb-1">Shape</legend>
          <div className="flex flex-wrap gap-2">
            {SHAPE_KEYS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                aria-pressed={shape === s}
                className={`flex flex-col items-center gap-1 rounded-md border px-2.5 py-2 transition ${
                  shape === s
                    ? 'border-accent bg-accent/15'
                    : 'border-bg-line bg-bg-elev hover:border-accent/50'
                }`}
              >
                <ShapeGlyph
                  shape={s}
                  color={color}
                  diamondColor={diamondColor}
                  cell={11}
                />
                <span className="text-[10px] text-gray-400">{s}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs text-gray-400 mb-1">Quality tier</legend>
          <div className="flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => setQuality(q.key)}
                aria-pressed={quality === q.key}
                className={`transition ${
                  quality === q.key ? 'ring-2 ring-offset-2 ring-offset-bg-panel ring-white/40' : ''
                } rounded-full`}
              >
                <TierBadge tier={q.key} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs text-gray-400 mb-1">Stat</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STATS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStat(s.key)}
                aria-pressed={stat === s.key}
                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left transition ${
                  stat === s.key
                    ? 'border-accent bg-accent/15'
                    : 'border-bg-line bg-bg-elev hover:border-accent/50'
                }`}
              >
                <StatIcon stat={s.key} size={22} />
                <span className="text-xs text-white truncate">{s.short}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="bg-bg-elev border border-bg-line rounded-md p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShapeGlyph
              shape={shape}
              color={color}
              diamondColor={diamondColor}
              cell={12}
            />
            <TierBadge tier={quality} />
            <StatIcon stat={stat} size={22} />
            <span className="text-sm text-white">{STAT_META[stat].name}</span>
          </div>
          <div className="text-lg font-semibold" style={{ color }}>
            +{buff}%
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-bg-line text-gray-300 hover:text-white hover:bg-bg-elev"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ shape, quality, stat })}
            className="px-3 py-1.5 rounded-md bg-accent text-white font-semibold hover:bg-accent/90"
          >
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
