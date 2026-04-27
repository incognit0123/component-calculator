import { useEffect, useRef, useState } from 'react'
import { STATS } from '../data/stats'
import type { StatTotals } from '../data/types'
import { StatIcon } from './icons/StatIcon'
import { PanelShell } from './PanelShell'
import { ocrStatsFromImage } from '../utils/statOcr'

interface Props {
  stats: StatTotals
  onChange: (stats: StatTotals) => void
  onReset: () => void
}

export function CurrentStatsPanel({ stats, onChange, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrMessage, setOcrMessage] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)

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
      <header className="flex items-center justify-end mb-4">
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
          className="app-button px-2 py-1 text-xs mr-2"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <label
            key={stat.key}
            className="panel-inner flex flex-col gap-1 p-3"
          >
            <span className="flex items-center gap-2 text-xs text-gray-300">
              <StatIcon stat={stat.key} size={20} />
              <span className="break-words">{stat.name}</span>
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
                className="app-input w-full px-2 py-1 text-sm focus:outline-none focus:border-accent"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </label>
        ))}
      </div>

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
