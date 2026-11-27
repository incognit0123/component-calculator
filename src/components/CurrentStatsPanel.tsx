import { useEffect, useRef, useState } from 'react'
import { Modal } from 'antd'
import { SCORE_STAT_META } from '../data/stats'
import type { StatTotals } from '../data/types'
import { StatIcon } from './icons/StatIcon'
import { PanelShell } from './PanelShell'
import { ocrStatsFromImage } from '../utils/statOcr'

interface Props {
  stats: StatTotals
  onChange: (stats: StatTotals) => void
  onReset: () => void
}

const INPUT_STATS = [
  SCORE_STAT_META.critDamage,
  SCORE_STAT_META.skillDamage,
  SCORE_STAT_META.vulnerability,
  SCORE_STAT_META.shieldDamage,
  SCORE_STAT_META.toWeakened,
  SCORE_STAT_META.toPoisoned,
  SCORE_STAT_META.toChilled,
  SCORE_STAT_META.laceration,
  SCORE_STAT_META.toBosses,
]

export function CurrentStatsPanel({ stats, onChange, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrMessage, setOcrMessage] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false)

  const handleUpload = async (file: File | null) => {
    if (!file) return
    setOcrLoading(true)
    setOcrMessage(null)
    try {
      const parsed = await ocrStatsFromImage(file)
      const keys = Object.keys(parsed) as (keyof StatTotals)[]
      if (keys.length === 0) {
        setOcrMessage('No recognized stats found in screenshot.')
        return
      }
      onChange({
        ...stats,
        ...parsed,
      })
      setOcrMessage(`Imported ${keys.length} stat${keys.length === 1 ? '' : 's'} from screenshot.`)
    } catch {
      setOcrMessage('Could not read screenshot. Try a clearer image.')
    } finally {
      setOcrLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      setOcrMessage('Clipboard image paste is not supported in this browser.')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (!imageType) continue
        const blob = await item.getType(imageType)
        const file = new File([blob], 'clipboard-image.png', { type: imageType })
        setIsImportOpen(false)
        await handleUpload(file)
        return
      }
      setOcrMessage('Clipboard does not contain an image.')
    } catch {
      setOcrMessage('Could not read clipboard image.')
    }
  }

  useEffect(() => {
    if (!isImportOpen) return
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      const imageItem = Array.from(items).find((item) =>
        item.type.startsWith('image/'),
      )
      if (!imageItem) return
      const blob = imageItem.getAsFile()
      if (!blob) return
      event.preventDefault()
      setIsImportOpen(false)
      void handleUpload(
        new File([blob], 'clipboard-image.png', { type: blob.type }),
      )
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isImportOpen])

  return (
    <PanelShell title="Current stats">
      <header className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setIsSetupGuideOpen(true)}
          className="app-button px-2 py-1 text-xs"
        >
          Setup guide
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            setIsImportOpen(false)
            void handleUpload(e.target.files?.[0] ?? null)
          }}
        />
        <button
          type="button"
          onClick={() => setIsImportOpen(true)}
          disabled={ocrLoading}
          className="app-button px-2 py-1 text-xs"
        >
          {ocrLoading ? 'Reading…' : 'Upload'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="app-button px-2 py-1 text-xs"
        >
          Reset to 0
        </button>
      </header>
      {ocrMessage && (
        <p className="text-xs text-gray-300 mb-3">{ocrMessage}</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {INPUT_STATS.map((stat) => (
          <label
            key={stat.key}
            className="panel-inner grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 p-2 sm:grid-cols-1 sm:grid-rows-[1fr_auto] sm:items-stretch sm:gap-1"
          >
            <span className="relative flex min-h-10 min-w-0 flex-col items-center justify-center gap-1 text-center text-xs leading-4 text-gray-300">
              <StatIcon stat={stat.key} size={20} className="shrink-0" />
              <span className="break-words">{stat.name}</span>
              {stat.key === 'vulnerability' && (
                <span
                  className="absolute left-1/2 top-0 ml-4 rounded-full bg-blue-400/15 px-1.5 text-[10px] font-semibold leading-4 text-blue-200 ring-1 ring-inset ring-blue-300/30"
                  title="New input: enter your Vulnerability before mount bonuses."
                >
                  New
                </span>
              )}
            </span>
            <div className="app-input flex h-8 w-full min-w-0 max-w-24 items-center justify-self-center focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <input
                type="number"
                aria-label={`${stat.name} (%)`}
                inputMode="decimal"
                min={0}
                step="0.1"
                value={Number.isFinite(stats[stat.key]) ? stats[stat.key] ?? 0 : 0}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  onChange({
                    ...stats,
                    [stat.key]: Number.isFinite(v) && v >= 0 ? v : 0,
                  })
                }}
                className="h-full w-full min-w-0 bg-transparent px-2 text-center text-sm tabular-nums focus:outline-none"
              />
              <span aria-hidden="true" className="shrink-0 pr-2 text-sm text-gray-400">%</span>
            </div>
          </label>
        ))}
      </div>

      <Modal
        open={isSetupGuideOpen}
        title="Set up current stats"
        footer={null}
        onCancel={() => setIsSetupGuideOpen(false)}
        styles={{
          container: { background: 'var(--sio-accent-surface)' },
          header: { background: 'transparent' },
          title: { color: 'var(--sio-text)' },
        }}
        closeIcon={<span className="text-gray-300">×</span>}
      >
        <ol className="list-decimal space-y-2 pl-5 pt-2 text-sm text-gray-200">
          <li>
            In <a href="https://sio-tools.exp0.dev/" target="_blank" rel="noreferrer" className="text-accent underline">Expo’s calculator</a>,{' '}
            turn off every switch under <strong>Mounts</strong>, then expand <strong>Result</strong>.
          </li>
          <li>
            Copy each percentage into the matching field in <strong>Current stats</strong>, or take a screenshot of <strong>Result</strong> and use <strong>Upload</strong>.
          </li>
        </ol>
      </Modal>

      {isImportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsImportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-md p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Import stats from screenshot
              </h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Choose an image file or paste an image from clipboard.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="app-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
              >
                Choose file
              </button>
              <button
                type="button"
                className="app-button"
                onClick={() => void handlePasteFromClipboard()}
                disabled={ocrLoading}
              >
                Paste clipboard
              </button>
            </div>

            <p className="text-[11px] text-gray-400">
              Tip: while this popup is open, press Ctrl/Cmd+V to paste an image.
            </p>
          </div>
        </div>
      )}
    </PanelShell>
  )
}
