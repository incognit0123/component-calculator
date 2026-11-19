import { useState } from 'react'
import { Modal } from 'antd'
import { BUFF_TABLE } from '../data/buffTable'
import { QUALITIES, QUALITY_META } from '../data/qualities'
import { SHAPE_KEYS } from '../data/shapes'
import { STATS, STAT_META } from '../data/stats'
import type { Piece, QualityTier, ShapeKey, StatKey, StatTotals } from '../data/types'
import { sortByMarginalGain } from '../utils/sortPieces'
import { ShapeGlyph } from './icons/ShapeGlyph'
import { TierBadge } from './icons/TierBadge'

export interface MergeInventory {
  boardCapacity: number
  hasBoardGaps: boolean
  inventoryCount: number
  currentStats: StatTotals
  onRecord: (sourceIds: string[], draft: Omit<Piece, 'id'>) => void
}

interface MergeOption {
  shape: ShapeKey
  quality: QualityTier
  nextQuality: QualityTier
  required: number
  pieces: Piece[]
}

function shapeLabel(shape: ShapeKey) {
  return shape === 'O' ? 'square' : shape
}

function pieceStatLabel({ quality, stat }: Piece) {
  return `${STAT_META[stat].name} (+${BUFF_TABLE[quality][stat]}%)`
}

function MergePieceGlyph({ shape, quality }: Pick<Piece, 'shape' | 'quality'>) {
  const { color, diamondColor } = QUALITY_META[quality]
  return (
    <span aria-hidden="true">
      <ShapeGlyph shape={shape} color={color} diamondColor={diamondColor} />
    </span>
  )
}

export function UnusedPieceMerges({ pieces, boardCapacity, hasBoardGaps, inventoryCount, currentStats, onRecord }: MergeInventory & { pieces: Piece[] }) {
  const [selected, setSelected] = useState<MergeOption | null>(null)
  const options: MergeOption[] = []
  const epicIndex = QUALITIES.findIndex(({ key }) => key === 'epic')
  const weakestFirst = sortByMarginalGain(pieces, currentStats).reverse()
  // The final quality has no upgrade tier in the inventory.
  for (const [index, { key: quality }] of QUALITIES.slice(0, -1).entries()) {
    const nextQuality = QUALITIES[index + 1].key
    const required = index < epicIndex ? 2 : 3
    for (const shape of SHAPE_KEYS) {
      const matches = weakestFirst.filter((piece) => piece.shape === shape && piece.quality === quality)
      if (matches.length >= required) options.push({ shape, quality, nextQuality, required, pieces: matches })
    }
  }
  if (options.length === 0) return null

  return (
    <>
      <details className="panel-inner mt-3 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-white">
          Merge options for unused pieces ({options.length})
        </summary>
        {inventoryCount <= boardCapacity && (
          <p className="mt-2 text-xs text-amber-300">Keep pieces for open board slots if you can. Each merge leaves you with fewer pieces.</p>
        )}
        <ul className="mt-2 divide-y divide-bg-line/50">
          {options.map((option) => (
            <li key={`${option.shape}-${option.quality}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <MergePieceGlyph shape={option.shape} quality={option.quality} />
                <TierBadge tier={option.quality} />
                <span className="text-xs text-gray-300">
                  {option.pieces.length} unused {shapeLabel(option.shape)} pieces · {option.required} per merge
                </span>
              </div>
              <button
                type="button"
                aria-label={`Record merge of ${QUALITY_META[option.quality].name} ${shapeLabel(option.shape)} pieces`}
                className="app-button px-2 py-1 text-xs"
                onClick={() => setSelected(option)}
              >
                Record merge
              </button>
            </li>
          ))}
        </ul>
      </details>
      {selected && (
        <MergeDialog
          option={selected}
          inventoryAfter={inventoryCount - selected.required + 1}
          boardCapacity={boardCapacity}
          hasBoardGaps={hasBoardGaps}
          onClose={() => setSelected(null)}
          onRecord={onRecord}
        />
      )}
    </>
  )
}

const selectClass = 'app-input block w-full px-2 py-1.5 text-sm'

function MergeDialog({ option, inventoryAfter, boardCapacity, hasBoardGaps, onClose, onRecord }: {
  option: MergeOption
  inventoryAfter: number
  boardCapacity: number
  hasBoardGaps: boolean
  onClose: () => void
  onRecord: MergeInventory['onRecord']
}) {
  const [sourceIds, setSourceIds] = useState(() => option.pieces.slice(0, option.required).map(({ id }) => id))
  const [stat, setStat] = useState<StatKey | ''>('')
  const shortfall = boardCapacity - inventoryAfter

  return (
    <Modal
      open
      title="Record a merge"
      styles={{
        container: { background: 'var(--sio-accent-surface)', color: 'var(--sio-text)' },
        header: { background: 'transparent' },
        title: { color: 'var(--sio-text)' },
      }}
      closeIcon={<span className="text-gray-300">×</span>}
      okText="Save merged piece"
      okButtonProps={{ disabled: !stat }}
      cancelButtonProps={{ style: { background: 'transparent', color: 'var(--sio-text)' } }}
      onCancel={onClose}
      onOk={() => {
        if (!stat) return
        onRecord(sourceIds, { shape: option.shape, quality: option.nextQuality, stat })
        onClose()
      }}
    >
      <div className="flex flex-col gap-4">
        <p>The recommended pieces to merge are pre-selected. Change them if needed, then choose the stat on the new piece.</p>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
            <MergePieceGlyph shape={option.shape} quality={option.quality} />
            Used {shapeLabel(option.shape)} pieces <TierBadge tier={option.quality} />
          </legend>
          {sourceIds.map((id, index) => (
            <label key={index} className="text-xs text-gray-300">
              Piece {index + 1}
              <select
                className={selectClass}
                value={id}
                onChange={(event) => {
                  const nextId = event.target.value
                  setSourceIds((ids) => ids.map((current, slot) => slot === index ? nextId : current))
                }}
              >
                {option.pieces.map((piece) => (
                  <option key={piece.id} value={piece.id} disabled={piece.id !== id && sourceIds.includes(piece.id)}>
                    {pieceStatLabel(piece)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
            <MergePieceGlyph shape={option.shape} quality={option.nextQuality} />
            New {shapeLabel(option.shape)} piece <TierBadge tier={option.nextQuality} />
          </legend>
          <label className="block text-xs text-gray-300">
            Stat
            <select className={selectClass} value={stat} onChange={(event) => setStat(event.target.value as StatKey | '')}>
              <option value="" disabled>Choose a stat</option>
              {STATS.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
        </fieldset>
        <div className="space-y-1 text-xs">
          <p className="text-gray-300">
            After this merge, you’ll have {inventoryAfter} pieces for {boardCapacity} board slots.
          </p>
          {shortfall > 0 && (
            <p className="text-amber-300">You’ll be {shortfall} {shortfall === 1 ? 'piece' : 'pieces'} short.</p>
          )}
          {hasBoardGaps && (
            <p className="text-amber-300">The current layout has gaps. Filling them also depends on which shapes fit.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
