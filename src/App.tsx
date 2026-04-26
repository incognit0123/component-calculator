import { useMemo } from 'react'
import { CurrentStatsPanel } from './components/CurrentStatsPanel'
import { PieceInventory } from './components/PieceInventory'
import { OptimizerPanel } from './components/OptimizerPanel'
import type { FullTimeLimit } from './components/OptimizerPanel'
import { BoardView } from './components/BoardView'
import { StatsSummary } from './components/StatsSummary'
import { PieceCard } from './components/PieceCard'
import { zeroStats } from './data/stats'
import type { OptimizerMode, Piece, StatTotals } from './data/types'
import { usePersistedState } from './hooks/usePersistedState'
import { useOptimizer } from './hooks/useOptimizer'
import { formula } from './optimizer/scoring'

const STATS_KEY = 'mount-opt:current-stats:v1'
const PIECES_KEY = 'mount-opt:pieces:v1'
const MODE_KEY = 'mount-opt:mode:v1'
const FULL_LIMIT_KEY = 'mount-opt:full-time-limit:v1'

export default function App() {
  const [currentStats, setCurrentStats] = usePersistedState<StatTotals>(
    STATS_KEY,
    zeroStats(),
  )
  const [pieces, setPieces] = usePersistedState<Piece[]>(PIECES_KEY, [])
  const [mode, setMode] = usePersistedState<OptimizerMode>(
    MODE_KEY,
    'normal',
    (raw): raw is OptimizerMode => raw === 'normal' || raw === 'full',
  )
  const [fullTimeLimit, setFullTimeLimit] = usePersistedState<FullTimeLimit>(
    FULL_LIMIT_KEY,
    { enabled: false, seconds: 30 },
  )

  const { status, run, cancel } = useOptimizer()

  const handleRun = () => {
    const timeBudgetMs =
      mode === 'full' && fullTimeLimit.enabled
        ? fullTimeLimit.seconds * 1000
        : undefined
    run({ currentStats, pieces, mode, timeBudgetMs })
  }

  const result = status.result ?? status.progress?.partial ?? null
  const unusedSet = useMemo(
    () => new Set(result?.unusedPieceIds ?? []),
    [result?.unusedPieceIds],
  )

  const currentScore = useMemo(() => formula(currentStats), [currentStats])

  const improvementPct = (before: number, after: number) => {
    if (before <= 0) return '—'
    const pct = ((after - before) / before) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  }

  const status_label =
    status.running
      ? `Running ${mode}…${status.progress ? ` (${status.progress.explored.toLocaleString()} explored)` : ''}`
      : status.result
        ? `${status.result.mode} · ${status.result.elapsedMs.toFixed(0)}ms${status.result.truncated ? ' · timed out' : ''}`
        : undefined

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-bg-line bg-bg-panel/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              Mount Board Optimizer
            </h1>
            <p className="text-xs text-gray-400">
              Survivor.io · finds the best 8×7 layout for your mount pieces
            </p>
          </div>
          <div className="text-right text-xs text-gray-400">
            <div>
              Current score:{' '}
              <span className="text-white font-semibold">
                {currentScore.toFixed(3)}×
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="flex flex-col gap-5">
          <CurrentStatsPanel
            stats={currentStats}
            onChange={setCurrentStats}
            onReset={() => setCurrentStats(zeroStats())}
          />
          <PieceInventory
            pieces={pieces}
            onChange={setPieces}
            unusedIds={unusedSet}
          />
        </div>

        <div className="flex flex-col gap-5">
          <OptimizerPanel
            mode={mode}
            onModeChange={setMode}
            running={status.running}
            canRun={pieces.length > 0}
            onRun={handleRun}
            onCancel={cancel}
            fullTimeLimit={fullTimeLimit}
            onFullTimeLimitChange={setFullTimeLimit}
            exploredCount={status.progress?.explored}
            statusLabel={status_label}
            progressLabel={
              status.error
                ? `Error: ${status.error}`
                : status.progress
                  ? `Best so far: ${status.progress.partial.afterScore.toFixed(3)}× (${improvementPct(status.progress.partial.beforeScore, status.progress.partial.afterScore)})`
                  : undefined
            }
          />

          {result ? (
            <section className="bg-bg-panel border border-bg-line rounded-xl p-5 flex flex-col gap-4">
              <header className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Result</h2>
                  <div className="text-xs text-gray-400">
                    {result.linesFilled} line{result.linesFilled === 1 ? '' : 's'} filled · {result.placements.length} piece{result.placements.length === 1 ? '' : 's'} placed
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Final score</div>
                  <div className="text-2xl font-bold text-white">
                    {result.afterScore.toFixed(3)}×
                  </div>
                  <div className="text-xs text-accent">
                    {improvementPct(result.beforeScore, result.afterScore)} vs. no mount
                  </div>
                </div>
              </header>

              <div className="flex justify-center">
                <BoardView pieces={pieces} placements={result.placements} />
              </div>

              <StatsSummary
                currentStats={currentStats}
                buffsFromMount={result.buffsFromMount}
              />

              {result.unusedPieceIds.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">
                    Unused pieces ({result.unusedPieceIds.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {result.unusedPieceIds.map((id) => {
                      const piece = pieces.find((p) => p.id === id)
                      if (!piece) return null
                      return <PieceCard key={id} piece={piece} dim />
                    })}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-500 text-right">
                {result.mode} mode · {result.elapsedMs.toFixed(0)}ms
                {result.truncated ? ' · timed out, best-so-far' : ''}
              </div>
            </section>
          ) : (
            <section className="bg-bg-panel border border-dashed border-bg-line rounded-xl p-8 text-center text-gray-400">
              <p className="text-sm">
                Add your current stats and at least one piece, then click{' '}
                <span className="text-white">Run optimizer</span>.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
