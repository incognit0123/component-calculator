import { useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { CurrentStatsPanel } from './components/CurrentStatsPanel'
import { PieceInventory } from './components/PieceInventory'
import { MountPanel } from './components/MountPanel'
import { OptimizerPanel } from './components/OptimizerPanel'
import type { FullTimeLimit, OptimizeScope } from './components/OptimizerPanel'
import { BoardView } from './components/BoardView'
import { BoardCoverage } from './components/BoardCoverage'
import { MountBoardPreview } from './components/MountBoardPreview'
import { StatsSummary, type StatsTab } from './components/StatsSummary'
import { isResultStale } from './utils/resultStale'
import { UnusedPiecesSection } from './components/UnusedPiecesSection'
import { PanelShell } from './components/PanelShell'
import {
  maxBonusLinesForLevel,
  type MountLevel,
} from './data/lineBonuses'
import {
  DEFAULT_MOUNT_KEY,
  isMountKey,
  MOUNT_KEYS,
  MOUNTS,
  type MountKey,
} from './data/mounts'
import { SCORE_STAT_KEYS, STAT_KEYS, zeroStats } from './data/stats'
import { MIN_PIECE_CELLS } from './data/shapes'
import type { Piece, StatTotals } from './data/types'
import { usePersistedState } from './hooks/usePersistedState'
import { useOptimizer } from './hooks/useOptimizer'
import { boardBits } from './optimizer/board'
import type { BoardResult, OptimizerInput } from './optimizer/types'

import {
  STATS_KEY, PIECES_KEY, MOUNT_LEVELS_KEY, SELECTED_MOUNT_KEY,
  UNLOCKED_MOUNTS_KEY, OPTIMIZE_SCOPE_KEY, FULL_LIMIT_KEY, PROFILES_KEY,
  encodeConfig, decodeConfig, legacySeededMountLevels, legacySeededUnlocked,
  isMountLevelMap, isUnlockedMap, isOptimizeScope,
  type MountLevelMap, type UnlockedMap, type SavedProfile, type ExportedConfig,
} from './utils/config'

/**
 * Aggregate the per-mount piece-buff contributions in result.boards into a
 * single sync-rate-scaled total — the "+ Pieces" column in the All-mounts
 * view.
 */
function aggregatePieceBuffs(boards: BoardResult[]): StatTotals {
  const out = zeroStats()
  for (const board of boards) {
    const mult = board.syncRate / 100
    for (const k of STAT_KEYS) {
      out[k] += board.buffsFromPieces[k] * mult
    }
  }
  return out
}

/** Per-stat values = pieces × syncRate, used in non-equipped per-mount tabs. */
function scaledForBoard(board: BoardResult): StatTotals {
  const out = zeroStats()
  const mult = board.syncRate / 100
  for (const k of STAT_KEYS) {
    out[k] = board.buffsFromPieces[k] * mult
  }
  return out
}

export default function App() {
  const [currentStats, setCurrentStats] = usePersistedState<StatTotals>(
    STATS_KEY,
    zeroStats(),
  )
  const [pieces, setPieces] = usePersistedState<Piece[]>(PIECES_KEY, [])
  const [selectedMountKey, setSelectedMountKey] = usePersistedState<MountKey>(
    SELECTED_MOUNT_KEY,
    DEFAULT_MOUNT_KEY,
    isMountKey,
  )
  const [mountLevels, setMountLevels] = usePersistedState<MountLevelMap>(
    MOUNT_LEVELS_KEY,
    legacySeededMountLevels(),
    isMountLevelMap,
  )
  const [unlockedMounts, setUnlockedMounts] = usePersistedState<UnlockedMap>(
    UNLOCKED_MOUNTS_KEY,
    legacySeededUnlocked(),
    isUnlockedMap,
  )
  const [optimizeScope, setOptimizeScope] = usePersistedState<OptimizeScope>(
    OPTIMIZE_SCOPE_KEY,
    'allUnlocked',
    isOptimizeScope,
  )
  const [fullTimeLimit, setFullTimeLimit] = usePersistedState<FullTimeLimit>(
    FULL_LIMIT_KEY,
    { enabled: true, seconds: 120 },
  )
  const [profiles, setProfiles] = usePersistedState<SavedProfile[]>(
    PROFILES_KEY,
    [],
  )

  const { status, run, cancel } = useOptimizer()
  const [runInput, setRunInput] = useState<OptimizerInput | null>(null)
  const [lastMergedPieceId, setLastMergedPieceId] = useState<string | null>(null)
  const [isProfilesOpen, setIsProfilesOpen] = useState(false)
  const [isSaveProfileOpen, setIsSaveProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [exportCopyStatus, setExportCopyStatus] = useState<string | null>(null)

  // Active board in the result section. Resets to the result's equipped mount
  // whenever a new result arrives. Distinct from the Mount Panel's
  // selectedMountKey — switching the displayed result board doesn't change
  // what the player has equipped in their game.
  const [displayedMountKey, setDisplayedMountKey] = useState<MountKey | null>(
    null,
  )
  const [activeStatsTab, setActiveStatsTab] = useState<string>('all')

  const result = status.result ?? status.progress?.partial ?? null
  const resultPieces = runInput?.pieces ?? pieces
  const resultStats = runInput?.currentStats ?? currentStats
  const pendingEquippedMount = result && MOUNTS[result.equippedMountKey].lineBonusesPending
    ? MOUNTS[result.equippedMountKey]
    : null
  const equippedResultBoard = result?.boards.find((board) => board.isEquipped)
  const lineBonusNotes = equippedResultBoard
    ? (MOUNTS[equippedResultBoard.mountKey].lineBonusNotes ?? []).filter((note) =>
        equippedResultBoard.linesFilled >= note.minLines && equippedResultBoard.mountLevel >= note.unlockedAtLevel,
      )
    : []

  // When a fresh result lands, default the displayed board and stats tab.
  useEffect(() => {
    if (!result) return
    setDisplayedMountKey((prev) => {
      if (prev && result.boards.some((b) => b.mountKey === prev)) return prev
      return result.equippedMountKey
    })
    setActiveStatsTab((prev) => {
      if (prev === 'all' && result.boards.length > 1) return 'all'
      if (result.boards.some((b) => b.mountKey === prev)) return prev
      return result.boards.length > 1 ? 'all' : result.equippedMountKey
    })
  }, [result])

  const unlockedKeys = MOUNT_KEYS.filter((k) => unlockedMounts[k])
  const unlockedCount = unlockedKeys.length
  const runMountKeys = [selectedMountKey]
  if (optimizeScope === 'allUnlocked') {
    runMountKeys.push(...unlockedKeys.filter((key) => key !== selectedMountKey))
  }
  const mountConfigs = runMountKeys.map((key) => ({
    mountKey: key,
    mountLevel: mountLevels[key],
    isEquipped: key === selectedMountKey,
  }))

  const handleMountLevelChange = (key: MountKey, level: MountLevel) => {
    setMountLevels((prev) => ({ ...prev, [key]: level }))
  }

  const handleUnlockedChange = (key: MountKey, unlocked: boolean) => {
    setUnlockedMounts((prev) => {
      const next = { ...prev, [key]: unlocked }
      // If the selected (equipped) mount was just locked, auto-switch to the
      // first remaining unlocked mount. We never lock the last unlocked one
      // (MountPanel disables that), so there is always a fallback.
      if (!unlocked && key === selectedMountKey) {
        const fallback = MOUNT_KEYS.find((k) => k !== key && next[k])
        if (fallback) setSelectedMountKey(fallback)
      }
      return next
    })
  }

  const handleRun = () => {
    const input: OptimizerInput = {
      currentStats: { ...currentStats },
      pieces: pieces.map((piece) => ({ ...piece })),
      mountConfigs,
      timeBudgetMs: fullTimeLimit.enabled ? fullTimeLimit.seconds * 1000 : undefined,
    }
    setRunInput(input)
    setLastMergedPieceId(null)
    run(input)
  }

  const improvementPct = (before: number, after: number) => {
    if (before <= 0) return '—'
    const pct = ((after - before) / before) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  }

  // Resolve the currently-displayed board.
  const displayedBoard: BoardResult | null = useMemo(() => {
    if (!result || !displayedMountKey) return null
    return result.boards.find((b) => b.mountKey === displayedMountKey) ?? null
  }, [result, displayedMountKey])

  const displayedMount = displayedBoard ? MOUNTS[displayedBoard.mountKey] : null

  // Every result view uses the inventory captured at the start of its run.
  // Later edits must not mix new pieces with old placements, stats or scores.
  const unusedPieces = useMemo(() => {
    if (!result) return []
    const byId = new Map(resultPieces.map((p) => [p.id, p]))
    return result.unusedPieceIds.flatMap((id) => {
      const piece = byId.get(id)
      return piece ? [piece] : []
    })
  }, [result, resultPieces])

  const inventoryChanged = useMemo(
    () => !!result && !status.running && isResultStale(result, pieces, runInput?.pieces),
    [result, pieces, runInput, status.running],
  )
  const setupChanged = !!result && !status.running && !!runInput && (
    SCORE_STAT_KEYS.some((key) => (resultStats[key] ?? 0) !== (currentStats[key] ?? 0)) ||
    mountConfigs.length !== runInput.mountConfigs.length ||
    mountConfigs.some((mount, index) => {
      const previous = runInput.mountConfigs[index]
      return mount.mountKey !== previous.mountKey || mount.mountLevel !== previous.mountLevel
    })
  )
  const resultStale = inventoryChanged || setupChanged

  const boardCapacity = result?.boards.reduce(
    (total, board) => total + boardBits(MOUNTS[board.mountKey].cols) / MIN_PIECE_CELLS,
    0,
  ) ?? 0
  const placedCount = result?.boards.reduce((total, board) => total + board.placements.length, 0) ?? 0
  const finishedResult = status.result?.stopReason === 'cancelled' ? null : status.result
  const includesAllUnlocked = finishedResult?.boards.length === unlockedKeys.length &&
    unlockedKeys.every((key) => finishedResult.boards.some((board) => board.mountKey === key))
  const mergeResult = finishedResult && !finishedResult.truncated && !resultStale && includesAllUnlocked
    ? finishedResult
    : null
  const mergeSaved = lastMergedPieceId !== null && pieces.some((piece) => piece.id === lastMergedPieceId)

  function recordMerge(sourceIds: string[], draft: Omit<Piece, 'id'>) {
    if (!mergeResult || sourceIds.some((id) => !mergeResult.unusedPieceIds.includes(id))) return
    const consumed = new Set(sourceIds)
    if (consumed.size !== sourceIds.length) return
    const newPiece = { ...draft, id: uuid() }
    setPieces((inventory) => {
      if (isResultStale(mergeResult, inventory, runInput?.pieces)) return inventory
      return [...inventory.filter((piece) => !consumed.has(piece.id)), newPiece]
    })
    setLastMergedPieceId(newPiece.id)
  }

  // Boards the time limit was too low to find *any* layout for (cut off before
  // placing a single piece). Only meaningful on the final result — while the
  // optimizer is still running, not-yet-solved boards are legitimately empty.
  const timedOutBoards = useMemo(() => {
    if (!result || status.running) return []
    return result.boards.filter(
      (b) => b.truncated && b.placements.length === 0,
    )
  }, [result, status.running])

  // Boards cut off by the time limit that still produced a layout: the layout
  // is the best found so far and may not be optimal.
  const partialBoards = useMemo(() => {
    if (!result || status.running) return []
    return result.boards.filter((b) => b.truncated && b.placements.length > 0)
  }, [result, status.running])

  // Stats-summary tab data for the active tab.
  const statsViewProps = useMemo(() => {
    if (!result) return null
    const tabs: StatsTab[] = []
    if (result.boards.length > 1) tabs.push({ id: 'all', label: 'All mounts' })
    for (const b of result.boards) {
      const m = MOUNTS[b.mountKey]
      tabs.push({
        id: b.mountKey,
        label: b.isEquipped ? `${m.name} (equipped)` : m.name,
      })
    }

    const tabId =
      tabs.find((t) => t.id === activeStatsTab)?.id ??
      (result.boards.length > 1 ? 'all' : result.equippedMountKey)

    if (tabId === 'all') {
      const equippedBoard = result.boards.find((b) => b.isEquipped)
      return {
        tabs,
        activeTabId: tabId,
        buffsFromPieces: aggregatePieceBuffs(result.boards),
        secondaryValues: equippedBoard?.buffsFromLines ?? zeroStats(),
        secondaryKind: 'lines' as const,
        secondaryLabel: equippedBoard && MOUNTS[equippedBoard.mountKey].lineBonusTiers.some((tier) => tier.minLines === 0) ? '+ Mount' : '+ Lines',
        secondaryPending: equippedBoard ? MOUNTS[equippedBoard.mountKey].lineBonusesPending === true : false,
        roundContributions: true,
      }
    }

    const board = result.boards.find((b) => b.mountKey === tabId)!
    if (board.isEquipped) {
      return {
        tabs,
        activeTabId: tabId,
        buffsFromPieces: board.buffsFromPieces,
        secondaryValues: board.buffsFromLines,
        secondaryKind: 'lines' as const,
        secondaryLabel: MOUNTS[board.mountKey].lineBonusTiers.some((tier) => tier.minLines === 0) ? '+ Mount' : '+ Lines',
        secondaryPending: MOUNTS[board.mountKey].lineBonusesPending === true,
        roundContributions: false,
      }
    }
    return {
      tabs,
      activeTabId: tabId,
      buffsFromPieces: board.buffsFromPieces,
      secondaryValues: scaledForBoard(board),
      secondaryKind: 'syncRate' as const,
      secondaryLabel: `(× ${board.syncRate}% sync rate)`,
      secondaryPending: false,
      roundContributions: true,
    }
  }, [result, activeStatsTab])

  const exportedString = useMemo(
    () =>
      encodeConfig({
        currentStats,
        pieces,
        selectedMountKey,
        mountLevels,
        unlockedMounts,
        optimizeScope,
        fullTimeLimit,
      }),
    [
      currentStats,
      fullTimeLimit,
      mountLevels,
      optimizeScope,
      pieces,
      selectedMountKey,
      unlockedMounts,
    ],
  )

  const handleOpenExport = () => {
    setExportCopyStatus(null)
    setIsExportOpen(true)
  }

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedString)
      setExportCopyStatus('Copied.')
    } catch {
      setExportCopyStatus('Copy failed.')
    }
  }

  const applyConfig = (parsed: ExportedConfig) => {
    setCurrentStats(parsed.currentStats)
    setPieces(parsed.pieces)
    setSelectedMountKey(parsed.selectedMountKey)
    setMountLevels(parsed.mountLevels)
    setUnlockedMounts(parsed.unlockedMounts)
    setOptimizeScope(parsed.optimizeScope)
    setFullTimeLimit(parsed.fullTimeLimit)
  }

  const handleImport = () => {
    try {
      const parsed = decodeConfig(importText.trim())
      applyConfig(parsed)
      setImportError(null)
      setImportText('')
      setIsImportOpen(false)
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Could not import configuration.',
      )
    }
  }

  const handleLoadConfig = (raw: string) => {
    const parsed = decodeConfig(raw)
    applyConfig(parsed)
  }

  const handleOpenSaveProfile = () => {
    setProfileError(null)
    setProfileName('')
    setIsSaveProfileOpen(true)
  }

  const handleSaveProfile = () => {
    const trimmed = profileName.trim()
    if (!trimmed) {
      setProfileError('Profile name is required.')
      return
    }

    const now = Date.now()
    const next: SavedProfile = {
      id: crypto.randomUUID(),
      name: trimmed,
      data: exportedString,
      updatedAt: now,
    }
    setProfiles((prev) => [next, ...prev])
    setIsSaveProfileOpen(false)
  }

  const handleLoadProfile = (profile: SavedProfile) => {
    try {
      handleLoadConfig(profile.data)
      setImportError(null)
    } catch {
      setImportError(
        `Could not load profile "${profile.name}". The saved data is invalid.`,
      )
    }
  }

  const handleDeleteProfile = (id: string) => {
    setProfiles((prev) => prev.filter((profile) => profile.id !== id))
  }

  const showPreviews = result != null && result.boards.length > 1

  return (
    <div className="min-h-screen bg-bg flex">
      <div
        onClick={() => setIsProfilesOpen(false)}
        aria-hidden={!isProfilesOpen}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          isProfilesOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-bg-line/70 bg-bg-panel p-4 flex flex-col shadow-2xl transform transition-transform duration-200 ${
          isProfilesOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!isProfilesOpen}
      >
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white">Profiles</h2>
          <p className="text-xs text-gray-400 mt-1">
            Save named snapshots and switch between them.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenSaveProfile}
          className="app-button mb-4 w-full"
        >
          Save Profile
        </button>

        <div className="flex-1 overflow-auto pr-1">
          {profiles.length === 0 ? (
            <div className="text-xs text-gray-500 border border-dashed border-bg-line rounded-lg p-3">
              No saved profiles yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <li key={profile.id} className="panel-inner p-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadProfile(profile)}
                      className="text-left flex-1 min-w-0"
                      title={`Load ${profile.name}`}
                    >
                      <div className="text-sm text-white truncate">
                        {profile.name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {new Date(profile.updatedAt).toLocaleString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(profile.id)}
                      className="text-gray-400 hover:text-red-400 text-xs"
                      aria-label={`Delete ${profile.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="border-b border-bg-line bg-bg-panel/50 backdrop-blur">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">
                Mount Board Optimizer
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsProfilesOpen((prev) => !prev)}
                className="app-button px-2.5 py-1 text-xs"
                aria-expanded={isProfilesOpen}
              >
                Profiles
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportError(null)
                  setImportText('')
                  setIsImportOpen(true)
                }}
                className="app-button px-2.5 py-1 text-xs"
              >
                Import
              </button>
              <button
                type="button"
                onClick={handleOpenExport}
                className="app-button px-2.5 py-1 text-xs"
              >
                Export
              </button>
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
              currentStats={currentStats}
              onChange={setPieces}
              resultStale={resultStale}
              // "Unused" only means something once a run has finished; mid-run
              // it's just the not-yet-placed pieces, so don't surface it.
              unusedIds={
                status.running || resultStale
                  ? undefined
                  : new Set(result?.unusedPieceIds ?? [])
              }
            />
            <MountPanel
              selectedMount={selectedMountKey}
              unlocked={unlockedMounts}
              levels={mountLevels}
              onSelectMount={setSelectedMountKey}
              onUnlockedChange={handleUnlockedChange}
              onLevelChange={handleMountLevelChange}
            />
          </div>

          <div className="flex flex-col gap-5">
            <OptimizerPanel
              running={status.running}
              canRun={pieces.length > 0}
              onRun={handleRun}
              onCancel={cancel}
              fullTimeLimit={fullTimeLimit}
              onFullTimeLimitChange={setFullTimeLimit}
              phase={status.progress?.phase}
              multipleMountsUnlocked={unlockedCount > 1}
              scope={optimizeScope}
              onScopeChange={setOptimizeScope}
              boardCount={mountConfigs.length}
              exploredCount={status.progress?.explored}
              fractionComplete={status.progress?.fractionComplete}
              boardIndex={status.progress?.boardIndex}
              progressBoardCount={status.progress?.boardCount}
              currentMountKey={status.progress?.currentMountKey}
              finishedMountKeys={status.progress?.partial.boards
                .filter((b) => b.mountKey !== status.progress?.currentMountKey)
                .map((b) => b.mountKey)}
              progressLabel={
                status.error
                  ? `Error: ${status.error}`
                  : status.progress
                    ? `Best so far: ${status.progress.partial.afterScore.toFixed(3)}× (${improvementPct(status.progress.partial.beforeScore, status.progress.partial.afterScore)})`
                    : undefined
              }
            />

            {result && displayedBoard && displayedMount ? (
              <PanelShell title="Result" bodyClassName="flex flex-col gap-4">
                {pendingEquippedMount && (
                  <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="note">
                    {pendingEquippedMount.name} line bonuses: TBA. This result includes known component and line bonuses; unknown line bonuses are excluded.
                  </p>
                )}
                {lineBonusNotes.map((note) => (
                  <p key={note.minLines} className="text-xs text-gray-300" role="note">
                    {note.text}
                  </p>
                ))}
                {status.running && (
                  <div className="text-xs text-accent italic">
                    Preliminary result (still working)…
                  </div>
                )}
                {!status.running && (
                  <p className="text-xs text-gray-300" role="status">
                    {result.stopReason === 'cancelled'
                        ? 'Cancelled. Showing the best layout found; optimality has not been proven.'
                        : result.stopReason === 'timeLimit'
                          ? 'Time limit reached. Showing the best layout found; optimality has not been proven.'
                          : result.stopReason === 'nodeLimit'
                            ? 'Search limit reached. Showing the best layout found; optimality has not been proven.'
                          : 'Best layout found. Global optimality has not been proven.'}
                  </p>
                )}
                {resultStale && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <span className="font-semibold">
                      {setupChanged ? 'Stats or mount settings changed since this result.' : 'Inventory changed since this result.'}
                    </span>{' '}
                    The board and stats below are from the previous run. Run again to update them.
                  </div>
                )}
                {timedOutBoards.length > 0 && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <span className="font-semibold">
                      Time limit too low for{' '}
                      {timedOutBoards
                        .map((b) => MOUNTS[b.mountKey].name)
                        .join(', ')}
                      .
                    </span>{' '}
                    No layout could be found in the allotted time — the{' '}
                    {timedOutBoards.length === 1 ? 'board' : 'boards'} above{' '}
                    {timedOutBoards.length === 1 ? 'is' : 'are'} empty. Raise the
                    time limit (or turn it off) and run again.
                  </div>
                )}
                {partialBoards.length > 0 && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <span className="font-semibold">
                      Time limit reached for{' '}
                      {partialBoards
                        .map((b) => MOUNTS[b.mountKey].name)
                        .join(', ')}
                      .
                    </span>{' '}
                    The layout shown is the best found so far and may not be
                    optimal. Raise the time limit (or turn it off) and run again
                    for a more thorough search.
                  </div>
                )}
                {/* Keep the old run internally consistent and visibly stale. */}
                <div
                  className={`flex flex-col gap-4 transition-opacity ${
                    resultStale ? 'opacity-40 grayscale' : ''
                  }`}
                  aria-label={resultStale ? 'Out-of-date result' : undefined}
                >
                <header className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="sr-only">Result</h2>
                    <div className="text-xs text-gray-400">
                      {displayedBoard.linesFilled} line
                      {displayedBoard.linesFilled === 1 ? '' : 's'} filled ·{' '}
                      {displayedBoard.placements.length} piece
                      {displayedBoard.placements.length === 1 ? '' : 's'} placed
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{pendingEquippedMount ? 'Score (line bonuses TBA)' : 'Best score'}</div>
                    <div className="text-2xl font-bold text-white">
                      {result.afterScore.toFixed(3)}×
                    </div>
                    <div className="text-xs text-accent">
                      {improvementPct(result.beforeScore, result.afterScore)} vs.
                      no mount
                    </div>
                  </div>
                </header>

                {finishedResult && (
                  <BoardCoverage placedCount={placedCount} capacity={boardCapacity} inventoryCount={resultPieces.length} />
                )}

                <div className="flex flex-col items-center gap-1">
                  <div className="text-sm text-gray-200">
                    {displayedMount.name}
                    {displayedBoard.isEquipped && (
                      <span className="text-gray-500 ml-1">(equipped)</span>
                    )}
                  </div>
                  <BoardView
                    pieces={resultPieces}
                    placements={displayedBoard.placements}
                    cols={displayedMount.cols}
                    maxHighlightedLines={
                      displayedBoard.isEquipped
                        ? maxBonusLinesForLevel(
                            displayedBoard.mountLevel,
                            displayedMount.lineBonusTiers,
                          )
                        : 0
                    }
                  />
                </div>

                {showPreviews && (
                  <div className="flex justify-center gap-3 flex-wrap">
                    {result.boards.map((board) => {
                      const m = MOUNTS[board.mountKey]
                      const label = board.isEquipped
                        ? `${m.name} (equipped)`
                        : `${m.name} · ${board.syncRate}% sync`
                      return (
                        <MountBoardPreview
                          key={board.mountKey}
                          pieces={resultPieces}
                          placements={board.placements}
                          cols={m.cols}
                          active={board.mountKey === displayedMountKey}
                          onClick={() => setDisplayedMountKey(board.mountKey)}
                          label={label}
                        />
                      )
                    })}
                  </div>
                )}

                {statsViewProps && (
                  <StatsSummary
                    currentStats={resultStats}
                    buffsFromPieces={statsViewProps.buffsFromPieces}
                    secondaryValues={statsViewProps.secondaryValues}
                    secondaryKind={statsViewProps.secondaryKind}
                    secondaryLabel={statsViewProps.secondaryLabel}
                    secondaryPending={statsViewProps.secondaryPending}
                    roundContributions={statsViewProps.roundContributions}
                    tabs={statsViewProps.tabs}
                    activeTabId={statsViewProps.activeTabId}
                    onTabChange={setActiveStatsTab}
                  />
                )}

                {!status.running && (
                  <UnusedPiecesSection
                    pieces={unusedPieces}
                    needsAllMounts={!!finishedResult && !resultStale && !includesAllUnlocked}
                    merge={mergeResult ? {
                      boardCapacity,
                      hasBoardGaps: placedCount < boardCapacity,
                      inventoryCount: pieces.length,
                      currentStats: resultStats,
                      onRecord: recordMerge,
                    } : undefined}
                  />
                )}
                </div>

                {mergeSaved && (
                  <p className="rounded-md border border-bg-line bg-bg-elev/40 px-3 py-2 text-xs text-gray-200" role="status">
                    Merge saved. Run the optimizer again to find more merge options.
                  </p>
                )}

                <div className="text-[11px] text-gray-500 text-right">
                  {result.elapsedMs.toFixed(0)}ms
                  {result.stopReason === 'timeLimit' ? ' · time limit reached' : result.stopReason === 'cancelled' ? ' · cancelled' : ''}
                </div>
              </PanelShell>
            ) : (
              <PanelShell title="Result">
                <section className="border-2 border-dashed border-[#151922] rounded-md p-8 text-center text-gray-400">
                  <p className="text-sm">
                    Add your current stats and at least one piece, then click{' '}
                    <span className="text-white">Run optimizer</span>.
                  </p>
                </section>
              </PanelShell>
            )}
          </div>
        </main>
      </div>

      {isExportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsExportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-2xl p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Export configuration
              </h3>
              <button
                type="button"
                onClick={() => setIsExportOpen(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Copy this string and share or save it for later import.
            </p>

            <textarea
              readOnly
              value={exportedString}
              className="w-full h-36 bg-bg-elev border border-bg-line rounded-md p-3 text-xs text-white"
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-accent">{exportCopyStatus ?? ''}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsExportOpen(false)}
                  className="app-button bg-[#2f354a] hover:bg-[#3b435d]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="app-button"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsImportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-2xl p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Import configuration
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

            <p className="text-xs text-gray-400">
              Paste an exported string from this app. Import will replace your
              current stats, pieces, mount settings, and time limit.
            </p>

            <textarea
              value={importText}
              onChange={(e) => {
                setImportError(null)
                setImportText(e.target.value)
              }}
              className="w-full h-36 bg-bg-elev border border-bg-line rounded-md p-3 text-xs text-white focus:outline-none focus:border-accent"
              placeholder="mount-opt:v6:..."
            />

            {importError && <p className="text-xs text-red-400">{importError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="app-button bg-[#2f354a] hover:bg-[#3b435d]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="app-button"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {isSaveProfileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsSaveProfileOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-bg-panel border border-bg-line rounded-xl w-full max-w-lg p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Save profile</h3>
              <button
                type="button"
                onClick={() => setIsSaveProfileOpen(false)}
                className="text-gray-400 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Save the current configuration as a named profile in local
              storage.
            </p>

            <input
              type="text"
              value={profileName}
              onChange={(e) => {
                setProfileError(null)
                setProfileName(e.target.value)
              }}
              className="w-full bg-bg-elev border border-bg-line rounded-md p-2 text-sm text-white focus:outline-none focus:border-accent"
              placeholder="Profile name"
            />

            {profileError && (
              <p className="text-xs text-red-400">{profileError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveProfileOpen(false)}
                className="app-button bg-[#2f354a] hover:bg-[#3b435d]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="app-button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
