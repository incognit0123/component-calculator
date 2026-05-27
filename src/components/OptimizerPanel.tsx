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
   * Number of boards a Run will optimize. Used as the fallback denominator for
   * the i/N indicator before the first progress event arrives.
   */
  boardCount: number
  exploredCount?: number
  progressLabel?: string
  /** Per-board completion fraction in [0, 1] from the latest progress event. */
  fractionComplete?: number
  /** 1-based index of the board currently being optimized. */
  boardIndex?: number
  /** Authoritative board count from the optimizer (overrides the prop fallback). */
  progressBoardCount?: number
}

interface BarProps {
  running: boolean
  /** Per-board time budget in ms (when the time-limit toggle is on). */
  timeBudgetMsPerBoard?: number
  exploredCount?: number
  fractionComplete?: number
  boardIndex?: number
  boardCount?: number
}

function ProgressBar({
  running,
  timeBudgetMsPerBoard,
  exploredCount,
  fractionComplete,
  boardIndex,
  boardCount,
}: BarProps) {
  const [boardStartedAt, setBoardStartedAt] = useState<number | null>(null)
  const lastBoardIndexRef = useRef<number | undefined>(undefined)
  const [, setTick] = useState(0)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) {
      setBoardStartedAt(null)
      lastBoardIndexRef.current = undefined
      return
    }
    if (boardIndex !== lastBoardIndexRef.current) {
      lastBoardIndexRef.current = boardIndex
      setBoardStartedAt(performance.now())
    }
  }, [running, boardIndex])

  useEffect(() => {
    if (!running) return
    if (boardStartedAt == null) setBoardStartedAt(performance.now())
    intervalRef.current = window.setInterval(() => {
      setTick((t) => t + 1)
    }, 100)
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [running, boardStartedAt])

  if (!running) return null

  const elapsedThisBoard =
    boardStartedAt != null ? performance.now() - boardStartedAt : 0
  const timed = timeBudgetMsPerBoard != null && timeBudgetMsPerBoard > 0
  const timePct = timed
    ? Math.min(100, (elapsedThisBoard / timeBudgetMsPerBoard) * 100)
    : 0
  const fractionPct = Math.min(100, Math.max(0, (fractionComplete ?? 0) * 100))
  const showIndicator = (boardCount ?? 0) > 1

  return (
    <div className="mt-3 flex items-start gap-2">
      {showIndicator && (
        <span className="text-xs text-gray-300 tabular-nums shrink-0 pt-0.5">
          {boardIndex ?? 1}/{boardCount}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="h-2.5 rounded-full bg-bg-line overflow-hidden">
          <div
            className="h-full bg-accent"
            style={{
              width: `${fractionPct}%`,
              transition: 'width 200ms linear',
            }}
          />
        </div>
        {timed && (
          <div className="h-1.5 rounded-full bg-bg-line overflow-hidden mt-0.5">
            <div
              className="h-full bg-accent/50"
              style={{
                width: `${timePct}%`,
                transition: 'width 100ms linear',
              }}
            />
          </div>
        )}
        <div className="flex justify-between text-[11px] text-gray-500 mt-1">
          <span>
            {(elapsedThisBoard / 1000).toFixed(1)}s elapsed
            {timed && ` / ${(timeBudgetMsPerBoard! / 1000).toFixed(1)}s`}
          </span>
          {exploredCount != null && exploredCount > 0 && (
            <span>{exploredCount.toLocaleString()} explored</span>
          )}
        </div>
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
  fractionComplete,
  boardIndex,
  progressBoardCount,
}: Props) {
  const timeBudgetMsPerBoard = fullTimeLimit.enabled
    ? fullTimeLimit.seconds * 1000
    : undefined
  const effectiveBoardCount = progressBoardCount ?? boardCount

  return (
    <PanelShell title="Optimizer">
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex flex-col gap-3 min-w-0">
          {multipleMountsUnlocked && (
            <div>
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
        timeBudgetMsPerBoard={timeBudgetMsPerBoard}
        exploredCount={exploredCount}
        fractionComplete={fractionComplete}
        boardIndex={boardIndex}
        boardCount={effectiveBoardCount}
      />

      {progressLabel && (
        <div className="mt-2 text-xs text-gray-400">{progressLabel}</div>
      )}
    </PanelShell>
  )
}
