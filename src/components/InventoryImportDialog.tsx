import { useEffect, useMemo, useRef, useState } from 'react'
import { QUALITY_META } from '../data/qualities'
import { STATS, STAT_META } from '../data/stats'
import type { Piece, StatKey } from '../data/types'
import { LOW_CONFIDENCE } from '../utils/inventoryScan/classify'
import type { RgbaImage } from '../utils/inventoryScan/image'
import { defaultStat, planImport } from '../utils/inventoryScan/importCounts'
import { LOW_FILTER_CONFIDENCE } from '../utils/inventoryScan/indicator'
import { scanFiles } from '../utils/inventoryScan/scanFiles'
import type { FileSegment, ScanProgress } from '../utils/inventoryScan/scanFiles'
import type { ScanSegment } from '../utils/inventoryScan/track'
import { countPieces } from './BulkPieceEditor'
import type { Counts } from './BulkPieceEditor'
import { ShapeGlyph } from './icons/ShapeGlyph'

interface Props {
  pieces: Piece[]
  onClose: () => void
  onReview: (counts: Counts) => void
}

type Status =
  | { kind: 'pick'; error?: string }
  | { kind: 'scanning'; progress: ScanProgress | null }
  | { kind: 'review'; segments: FileSegment[]; stats: (StatKey | null)[]; skipped: string | null }

function skippedMessage(names: string[]): string | null {
  if (names.length === 0) return null
  return `Skipped ${names.join(', ')}: the browser did not recognise ${names.length === 1 ? 'it' : 'them'} as a video or image.`
}

function Sample({ image }: { image: RgbaImage }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  }, [image])
  return <canvas ref={ref} width={image.width} height={image.height} className="h-12 w-12 rounded" />
}

function SegmentCard({
  segment,
  stat,
  onStat,
}: {
  segment: FileSegment
  stat: StatKey | null
  onStat: (s: StatKey | null) => void
}) {
  const groups = useMemo(() => {
    const m = new Map<string, { shape: NonNullable<ScanSegment['pieces'][number]['shape']>; quality: NonNullable<ScanSegment['pieces'][number]['quality']>; n: number }>()
    for (const p of segment.pieces) {
      if (!p.shape || !p.quality) continue
      const k = `${p.quality}|${p.shape}`
      const g = m.get(k) ?? { shape: p.shape, quality: p.quality, n: 0 }
      g.n += 1
      m.set(k, g)
    }
    return [...m.values()]
  }, [segment])
  const flagged = segment.pieces.filter((p) => p.sample && (!p.shape || !p.quality || p.confidence < LOW_CONFIDENCE))
  const unclearStat = segment.filter !== 'all' && segment.filterConfidence < LOW_FILTER_CONFIDENCE

  return (
    <div className="rounded-md bg-bg-elev/40 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <select
          aria-label="Stat for this list"
          value={stat ?? ''}
          onChange={(e) => onStat((e.target.value || null) as StatKey | null)}
          className={`app-input px-2 py-1 text-sm ${unclearStat ? 'border-amber-400' : ''}`}
        >
          <option value="">Skip</option>
          {STATS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-300">
          {segment.pieces.length} piece{segment.pieces.length === 1 ? '' : 's'}
        </span>
      </div>
      {segment.filter === 'all' && (
        <p className="text-xs text-gray-400">The ALL filter doesn't show which stat a piece has, so this part is skipped.</p>
      )}
      {unclearStat && <p className="text-xs text-amber-300">The filter icon was hard to read. Check the stat.</p>}
      {segment.ambiguousSteps > 0 && (
        <p className="text-xs text-amber-300">
          The list moved too fast to follow in {segment.ambiguousSteps} place{segment.ambiguousSteps === 1 ? '' : 's'}, so
          counts may be off. Record this filter again, scrolling slowly.
        </p>
      )}
      {segment.spansFiles && (
        <p className="text-xs text-amber-300">
          This filter continues from one file into the next, so counts may be off. Record each filter in a single recording.
        </p>
      )}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <span key={`${g.quality}|${g.shape}`} className="flex items-center gap-1 text-xs text-white">
              <ShapeGlyph shape={g.shape} color={QUALITY_META[g.quality].color} diamondColor={QUALITY_META[g.quality].diamondColor} cell={9} />
              ×{g.n}
            </span>
          ))}
        </div>
      )}
      {flagged.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-amber-300">Check these in Bulk edit; they were hard to read:</p>
          <div className="flex flex-wrap gap-1">
            {flagged.map((p) => (
              <Sample key={`${p.row},${p.col}`} image={p.sample!} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function InventoryImportDialog({ pieces, onClose, onReview }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'pick' })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const start = async (files: File[]) => {
    if (files.length === 0) return
    const controller = new AbortController()
    abort.current = controller
    setStatus({ kind: 'scanning', progress: null })
    try {
      const { segments, skipped } = await scanFiles(files, (progress) => setStatus({ kind: 'scanning', progress }), controller.signal)
      if (segments.every((s) => s.frames === 0) || segments.length === 0) {
        const notFound =
          skipped.length < files.length ? 'No Install Component list was found. Check that the recording shows that screen.' : null
        setStatus({ kind: 'pick', error: [skippedMessage(skipped), notFound].filter(Boolean).join(' ') })
        return
      }
      setStatus({ kind: 'review', segments, stats: segments.map(defaultStat), skipped: skippedMessage(skipped) })
    } catch (e) {
      if (controller.signal.aborted) setStatus({ kind: 'pick' })
      else setStatus({ kind: 'pick', error: e instanceof Error ? e.message : 'Could not read the files.' })
    }
  }

  const plan =
    status.kind === 'review'
      ? planImport(
          status.segments.map((segment, i) => ({ segment, stat: status.stats[i] })),
          pieces,
        )
      : null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import from game"
        className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Import from game</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {status.kind === 'pick' && (
          <>
            <ol className="list-decimal pl-5 text-sm text-gray-300 flex flex-col gap-1">
              <li>In the game, uninstall all components, so the list holds every piece.</li>
              <li>
                Open <strong className="text-white">Install Component</strong>, then start your phone's screen recorder.
              </li>
              <li>
                For each stat in the <strong className="text-white">Filter</strong> menu: select it, then scroll slowly to
                the bottom of the list.
              </li>
              <li>Stop recording and upload the video here. Screenshots work too when a list fits on one screen.</li>
            </ol>
            <p className="text-xs text-gray-400">The recording is read in your browser and never uploaded anywhere.</p>
            {status.error && <p className="text-sm text-amber-300">{status.error}</p>}
            <label className="app-button self-start cursor-pointer">
              Choose recording or screenshots
              <input
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={(e) => void start([...(e.target.files ?? [])])}
              />
            </label>
          </>
        )}

        {status.kind === 'scanning' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-300">
              Reading {status.progress ? `${status.progress.file}: ${status.progress.done} / ${status.progress.total}` : '…'}
            </p>
            <progress
              className="w-full"
              value={status.progress?.done ?? 0}
              max={status.progress?.total ?? 1}
            />
            <button type="button" onClick={() => abort.current?.abort()} className="self-start text-sm text-gray-300 hover:text-white">
              Cancel
            </button>
          </div>
        )}

        {status.kind === 'review' && plan && (
          <>
            <p className="text-xs text-gray-400">
              One list per filter found. Stats you didn't record keep their current pieces.
            </p>
            <div className="flex flex-col gap-2">
              {status.segments.map((segment, i) => (
                <SegmentCard
                  key={i}
                  segment={segment}
                  stat={status.stats[i]}
                  onStat={(s) =>
                    setStatus({ ...status, stats: status.stats.map((old, j) => (j === i ? s : old)) })
                  }
                />
              ))}
            </div>
            {plan.duplicates.map((stat) => (
              <p key={stat} className="text-xs text-amber-300">
                {STAT_META[stat].name} appears in more than one list; only the longest is used, as the others usually show the same pieces again.
              </p>
            ))}
            {plan.cleared.map(({ stat, removed }) => (
              <p key={stat} className="text-xs text-amber-300">
                No {STAT_META[stat].name} pieces were found, so applying removes your{' '}
                {removed === 1 ? '1 current piece. Choose Skip to keep it.' : `${removed} current pieces. Choose Skip to keep them.`}
              </p>
            ))}
            {plan.unreadable > 0 && (
              <p className="text-xs text-amber-300">
                {plan.unreadable} piece{plan.unreadable === 1 ? '' : 's'} could not be read; add them in Bulk edit.
              </p>
            )}
            {status.skipped && <p className="text-xs text-amber-300">{status.skipped}</p>}
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setStatus({ kind: 'pick' })} className="text-sm text-gray-300 hover:text-white">
                Start over
              </button>
              <button
                type="button"
                disabled={plan.importedStats.length === 0}
                onClick={() => onReview(countPieces(plan.pieces.map((p, i) => ({ ...p, id: String(i) }))))}
                className="app-button"
              >
                Review in Bulk edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
