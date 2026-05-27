import { useEffect, useRef, useState } from 'react'
import { PanelShell } from './PanelShell'

export interface FullTimeLimit {
  enabled: boolean
  seconds: number
}

export type OptimizeScope = 'allUnlocked' | 'equippedOnly'

interface Props {
  running: boolean
  canRun: boolean
  onRun: () => void
  onCancel: () => void
  fullTimeLimit: FullTimeLimit
  onFullTimeLimitChange: (next: FullTimeLimit) => void
  /**
   * When the player has 2+ unlocked mounts, the panel surfaces a scope
   * toggle. Hidden entirely when only 1 is unlocked (degenerate).
   */
  multipleMountsUnlocked: boolean
  scope: OptimizeScope
  onScopeChange: (next: OptimizeScope) => void
  /**
   * Number of boards a Run will optimize (1 if only the equipped mount is in
   * scope, otherwise the count of unlocked mounts). Used to size the progress
   * bar's worst-case duration since `fullTimeLimit` is applied per-board.
   */
  boardCount: number
  exploredCount?: number
  progressLabel?: string
  statusLabel?: string
}

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
  running,
  canRun,
  onRun,
  onCancel,
  fullTimeLimit,
  onFullTimeLimitChange,
  multipleMountsUnlocked,
  scope,
  onScopeChange,
  boardCount,
  exploredCount,
  progressLabel,
  statusLabel,
}: Props) {
  const totalMs = fullTimeLimit.enabled
    ? fullTimeLimit.seconds * 1000 * Math.max(1, boardCount)
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

      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex flex-col gap-3 min-w-0">
          {multipleMountsUnlocked && (
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Optimize</div>
              <div className="inline-flex rounded-full border border-bg-line bg-bg-elev p-0.5">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => onScopeChange('allUnlocked')}
                  aria-pressed={scope === 'allUnlocked'}
                  className={`text-xs px-3 py-1 rounded-full transition disabled:opacity-50 ${
                    scope === 'allUnlocked'
                      ? 'bg-accent text-bg font-semibold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  All unlocked mounts
                </button>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => onScopeChange('equippedOnly')}
                  aria-pressed={scope === 'equippedOnly'}
                  className={`text-xs px-3 py-1 rounded-full transition disabled:opacity-50 ${
                    scope === 'equippedOnly'
                      ? 'bg-accent text-bg font-semibold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Equipped only
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-gray-400 mb-1.5">Time limit</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
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
                <span>Limit search</span>
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
              <span className="text-gray-500">
                seconds{boardCount > 1 && ' per board'}
              </span>
              {!fullTimeLimit.enabled && (
                <span className="text-gray-500 italic">
                  · unlimited (cancel to stop)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
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
