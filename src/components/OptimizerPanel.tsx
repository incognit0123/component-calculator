import { useEffect, useRef, useState } from 'react'
import type { OptimizerMode } from '../data/types'
import { PanelShell } from './PanelShell'

export interface FullTimeLimit {
  enabled: boolean
  seconds: number
}

interface Props {
  mode: OptimizerMode
  onModeChange: (m: OptimizerMode) => void
  running: boolean
  canRun: boolean
  onRun: () => void
  onCancel: () => void
  fullTimeLimit: FullTimeLimit
  onFullTimeLimitChange: (next: FullTimeLimit) => void
  exploredCount?: number
  progressLabel?: string
  statusLabel?: string
}

const MODES: { key: OptimizerMode; name: string; desc: string }[] = [
  { key: 'normal', name: 'Normal', desc: 'Likely optimal, restricted search' },
  { key: 'full', name: 'Full', desc: 'Guaranteed optimal, exhaustive' },
]

interface BarProps {
  running: boolean
  totalMs?: number
  exploredCount?: number
}

function ProgressBar({ running, totalMs, exploredCount }: BarProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (running) {
      setStartedAt(performance.now())
      intervalRef.current = window.setInterval(() => {
        setTick((t) => t + 1)
      }, 100)
      return () => {
        if (intervalRef.current != null) {
          window.clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }
    setStartedAt(null)
    return undefined
  }, [running])

  if (!running) return null

  const elapsed = startedAt != null ? performance.now() - startedAt : 0
  const determinate = totalMs != null && totalMs > 0
  const pct = determinate ? Math.min(100, (elapsed / totalMs) * 100) : 0

  return (
    <div className="mt-3">
      {determinate ? (
        <div className="h-1.5 rounded-full bg-bg-line overflow-hidden">
          <div
            className="h-full bg-accent"
            style={{ width: `${pct}%`, transition: 'width 100ms linear' }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span
            className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse"
            aria-hidden
          />
          <span>Working…</span>
        </div>
      )}
      <div className="flex justify-between text-[11px] text-gray-500 mt-1">
        <span>
          {(elapsed / 1000).toFixed(1)}s elapsed
          {determinate && ` / ${(totalMs! / 1000).toFixed(1)}s budget`}
        </span>
        {exploredCount != null && exploredCount > 0 && (
          <span>{exploredCount.toLocaleString()} explored</span>
        )}
      </div>
    </div>
  )
}

export function OptimizerPanel({
  mode,
  onModeChange,
  running,
  canRun,
  onRun,
  onCancel,
  fullTimeLimit,
  onFullTimeLimitChange,
  exploredCount,
  progressLabel,
  statusLabel,
}: Props) {
  const totalMs =
    mode === 'full' && fullTimeLimit.enabled
      ? fullTimeLimit.seconds * 1000
      : undefined

  return (
    <PanelShell title="Optimizer">
      <header className="flex items-center justify-end mt-1 mb-4">
        {statusLabel && (
          <span className="text-xs text-gray-300 leading-tight text-right">
            {statusLabel}
          </span>
        )}
      </header>

      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
        <div className="flex-1">
          <div className="text-xs text-gray-400 mb-2">Mode</div>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={running}
                onClick={() => onModeChange(m.key)}
                aria-pressed={mode === m.key}
                className={`text-left rounded-md border p-2 transition disabled:opacity-50 ${
                  mode === m.key
                    ? 'border-accent bg-[#404458]'
                    : 'border-[#151922] bg-transparent hover:border-[#151922]'
                }`}
              >
                <div className="text-sm font-semibold text-white">{m.name}</div>
                <div className="text-[11px] text-gray-400">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              className="app-button border-red-500/60 bg-red-700/70 text-white hover:bg-red-600"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun}
              className="app-button px-4 py-2 disabled:cursor-not-allowed"
            >
              Run optimizer
            </button>
          )}
        </div>
      </div>

      {mode === 'full' && (
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fullTimeLimit.enabled}
              disabled={running}
              onChange={(e) =>
                onFullTimeLimitChange({
                  ...fullTimeLimit,
                  enabled: e.target.checked,
                })
              }
              className="accent-accent"
            />
            <span>Time limit</span>
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={fullTimeLimit.seconds}
            disabled={!fullTimeLimit.enabled || running}
            onChange={(e) => {
              const v = Math.max(1, Math.floor(Number(e.target.value) || 0))
              onFullTimeLimitChange({ ...fullTimeLimit, seconds: v })
            }}
            className="app-input w-20 px-2 py-1 text-xs focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <span className="text-gray-500">seconds</span>
          {!fullTimeLimit.enabled && (
            <span className="text-gray-500 italic">
              · unlimited (cancel to stop)
            </span>
          )}
        </div>
      )}

      <ProgressBar
        running={running}
        totalMs={totalMs}
        exploredCount={exploredCount}
      />

      {progressLabel && (
        <div className="mt-2 text-xs text-gray-400">{progressLabel}</div>
      )}
    </PanelShell>
  )
}
