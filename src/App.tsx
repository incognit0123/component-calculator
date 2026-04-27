import { useMemo, useState } from 'react'
import { CurrentStatsPanel } from './components/CurrentStatsPanel'
import { PieceInventory } from './components/PieceInventory'
import { MountPanel } from './components/MountPanel'
import { OptimizerPanel } from './components/OptimizerPanel'
import type { FullTimeLimit } from './components/OptimizerPanel'
import { BoardView } from './components/BoardView'
import { StatsSummary } from './components/StatsSummary'
import { PieceCard } from './components/PieceCard'
import { PanelShell } from './components/PanelShell'
import {
  MAX_MOUNT_LEVEL,
  maxBonusLinesForLevel,
  type MountLevel,
} from './data/lineBonuses'
import { QUALITIES } from './data/qualities'
import { SHAPE_KEYS } from './data/shapes'
import { STAT_KEYS, zeroStats } from './data/stats'
import type { OptimizerMode, Piece, StatTotals } from './data/types'
import { usePersistedState } from './hooks/usePersistedState'
import { useOptimizer } from './hooks/useOptimizer'
import { finalizeStats, formula } from './optimizer/scoring'

const STATS_KEY = 'mount-opt:current-stats:v1'
const PIECES_KEY = 'mount-opt:pieces:v1'
const MODE_KEY = 'mount-opt:mode:v1'
const MOUNT_LEVEL_KEY = 'mount-opt:mount-level:v1'
const FULL_LIMIT_KEY = 'mount-opt:full-time-limit:v1'
const PROFILES_KEY = 'mount-opt:profiles:v1'
const EXPORT_PREFIX_V1 = 'mount-opt:v1:'
const EXPORT_PREFIX_V2 = 'mount-opt:v2:'
const EXPORT_PREFIX_V3 = 'mount-opt:v3:'

interface ExportedConfig {
  currentStats: StatTotals
  pieces: Piece[]
  mode: OptimizerMode
  mountLevel: MountLevel
  fullTimeLimit: FullTimeLimit
}

type CompactMode = 'n' | 'f'
type CompactPiece = [shape: Piece['shape'], quality: Piece['quality'], stat: Piece['stat']]

interface ExportedConfigV3 {
  version: 3
  s: number[]
  p: CompactPiece[]
  m: CompactMode
  l: number
  t: [enabled: 0 | 1, seconds: number]
}

interface SavedProfile {
  id: string
  name: string
  data: string
  updatedAt: number
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function encodeConfig(config: ExportedConfig): string {
  const compact: ExportedConfigV3 = {
    version: 3,
    s: STAT_KEYS.map((key) => config.currentStats[key]),
    p: config.pieces.map((piece) => [piece.shape, piece.quality, piece.stat]),
    m: config.mode === 'normal' ? 'n' : 'f',
    l: config.mountLevel,
    t: [config.fullTimeLimit.enabled ? 1 : 0, config.fullTimeLimit.seconds],
  }
  const json = JSON.stringify(compact)
  const base64 = bytesToBase64(new TextEncoder().encode(json))
  return `${EXPORT_PREFIX_V3}${base64}`
}

function isMountLevel(value: unknown): value is MountLevel {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_MOUNT_LEVEL
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStatTotals(value: unknown): value is StatTotals {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  return STAT_KEYS.every((key) => isFiniteNumber(record[key]))
}

function isPiece(value: unknown): value is Piece {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    SHAPE_KEYS.includes(record.shape as (typeof SHAPE_KEYS)[number]) &&
    QUALITIES.some((q) => q.key === record.quality) &&
    STAT_KEYS.includes(record.stat as (typeof STAT_KEYS)[number])
  )
}

function isFullTimeLimit(value: unknown): value is FullTimeLimit {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.enabled === 'boolean' &&
    isFiniteNumber(record.seconds) &&
    record.seconds >= 1
  )
}

function decodeCompactPayload(
  parsed: Record<string, unknown>,
  expectedVersion: 2 | 3,
): ExportedConfig {
  const validShape =
    parsed.version === expectedVersion &&
    Array.isArray(parsed.s) &&
    parsed.s.length === STAT_KEYS.length &&
    parsed.s.every((value) => isFiniteNumber(value)) &&
    Array.isArray(parsed.p) &&
    parsed.p.every((piece) => {
      if (!Array.isArray(piece) || piece.length !== 3) return false
      const [shape, quality, stat] = piece
      return (
        SHAPE_KEYS.includes(shape as (typeof SHAPE_KEYS)[number]) &&
        QUALITIES.some((q) => q.key === quality) &&
        STAT_KEYS.includes(stat as (typeof STAT_KEYS)[number])
      )
    }) &&
    (parsed.m === 'n' || parsed.m === 'f') &&
    Array.isArray(parsed.t) &&
    parsed.t.length === 2 &&
    (parsed.t[0] === 0 || parsed.t[0] === 1) &&
    isFiniteNumber(parsed.t[1]) &&
    parsed.t[1] >= 1

  if (!validShape) throw new Error('Import string data is invalid.')

  let mountLevel: MountLevel = 0
  if (expectedVersion === 3) {
    if (!isMountLevel(parsed.l)) {
      throw new Error('Import string data is invalid.')
    }
    mountLevel = parsed.l
  }

  const statValues = parsed.s as number[]
  const compactPieces = parsed.p as CompactPiece[]
  const [enabledFlag, seconds] = parsed.t as [0 | 1, number]

  const currentStats = STAT_KEYS.reduce<StatTotals>((acc, key, index) => {
    acc[key] = statValues[index]
    return acc
  }, zeroStats())

  const pieces: Piece[] = compactPieces.map(([shape, quality, stat]) => ({
    id: crypto.randomUUID(),
    shape,
    quality,
    stat,
  }))

  return {
    currentStats,
    pieces,
    mode: parsed.m === 'n' ? 'normal' : 'full',
    mountLevel,
    fullTimeLimit: {
      enabled: enabledFlag === 1,
      seconds,
    },
  }
}

function decodeConfig(raw: string): ExportedConfig {
  if (raw.startsWith(EXPORT_PREFIX_V3)) {
    const payload = raw.slice(EXPORT_PREFIX_V3.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>
    return decodeCompactPayload(parsed, 3)
  }

  if (raw.startsWith(EXPORT_PREFIX_V2)) {
    const payload = raw.slice(EXPORT_PREFIX_V2.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>
    return decodeCompactPayload(parsed, 2)
  }

  if (raw.startsWith(EXPORT_PREFIX_V1)) {
    const payload = raw.slice(EXPORT_PREFIX_V1.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>

    if (
      parsed.version !== 1 ||
      !isStatTotals(parsed.currentStats) ||
      !Array.isArray(parsed.pieces) ||
      !parsed.pieces.every((piece) => isPiece(piece)) ||
      (parsed.mode !== 'normal' && parsed.mode !== 'full') ||
      !isFullTimeLimit(parsed.fullTimeLimit)
    ) {
      throw new Error('Import string data is invalid.')
    }

    return {
      currentStats: parsed.currentStats,
      pieces: parsed.pieces,
      mode: parsed.mode,
      mountLevel: 0,
      fullTimeLimit: parsed.fullTimeLimit,
    }
  }

  throw new Error('Unrecognized import string format.')
}

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
  const [mountLevel, setMountLevel] = usePersistedState<MountLevel>(
    MOUNT_LEVEL_KEY,
    0,
    (raw): raw is MountLevel => isMountLevel(raw),
  )
  const [fullTimeLimit, setFullTimeLimit] = usePersistedState<FullTimeLimit>(
    FULL_LIMIT_KEY,
    { enabled: false, seconds: 30 },
  )
  const [profiles, setProfiles] = usePersistedState<SavedProfile[]>(
    PROFILES_KEY,
    [],
  )

  const { status, run, cancel } = useOptimizer()
  const [isProfilesOpen, setIsProfilesOpen] = useState(false)
  const [isSaveProfileOpen, setIsSaveProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [exportCopyStatus, setExportCopyStatus] = useState<string | null>(null)

  const handleRun = () => {
    const timeBudgetMs =
      mode === 'full' && fullTimeLimit.enabled
        ? fullTimeLimit.seconds * 1000
        : undefined
    run({ currentStats, pieces, mode, mountLevel, timeBudgetMs })
  }

  const result = status.result ?? status.progress?.partial ?? null
  const unusedSet = useMemo(
    () => new Set(result?.unusedPieceIds ?? []),
    [result?.unusedPieceIds],
  )

  // Re-derive the displayed score and mount-buff totals against the *current*
  // mount level + stats so the UI stays accurate when the user adjusts stars
  // without re-running the optimizer. The placement layout itself stays fixed
  // (it may no longer be optimal — re-running gets a fresh layout).
  const displayedResult = useMemo(() => {
    if (!result) return null
    const pieceById = new Map(pieces.map((p) => [p.id, p]))
    const placedPieces = result.placements
      .map((pl) => pieceById.get(pl.pieceId))
      .filter((p): p is Piece => p != null)
    const { final, buffs } = finalizeStats(
      currentStats,
      placedPieces,
      result.linesFilled,
      mountLevel,
    )
    return {
      ...result,
      afterScore: formula(final),
      beforeScore: formula(currentStats),
      buffsFromMount: buffs,
    }
  }, [result, pieces, currentStats, mountLevel])

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

  const exportedString = useMemo(
    () =>
      encodeConfig({
        currentStats,
        pieces,
        mode,
        mountLevel,
        fullTimeLimit,
      }),
    [currentStats, fullTimeLimit, mode, mountLevel, pieces],
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

  const handleImport = () => {
    try {
      const parsed = decodeConfig(importText.trim())
      setCurrentStats(parsed.currentStats)
      setPieces(parsed.pieces)
      setMode(parsed.mode)
      setMountLevel(parsed.mountLevel)
      setFullTimeLimit(parsed.fullTimeLimit)
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
    setCurrentStats(parsed.currentStats)
    setPieces(parsed.pieces)
    setMode(parsed.mode)
    setMountLevel(parsed.mountLevel)
    setFullTimeLimit(parsed.fullTimeLimit)
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
              <p className="text-xs text-gray-400">
                Survivor.io · finds the best 8×7 layout for your mount pieces
              </p>
            </div>
            <div className="text-right text-xs text-gray-400 flex flex-col items-end gap-2">
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
            <MountPanel level={mountLevel} onChange={setMountLevel} />
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

            {displayedResult ? (
              <PanelShell title="Result" bodyClassName="flex flex-col gap-4">
                <header className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="sr-only">Result</h2>
                    <div className="text-xs text-gray-400">
                      {displayedResult.linesFilled} line{displayedResult.linesFilled === 1 ? '' : 's'} filled · {displayedResult.placements.length} piece{displayedResult.placements.length === 1 ? '' : 's'} placed
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Final score</div>
                    <div className="text-2xl font-bold text-white">
                      {displayedResult.afterScore.toFixed(3)}×
                    </div>
                    <div className="text-xs text-accent">
                      {improvementPct(displayedResult.beforeScore, displayedResult.afterScore)} vs.
                      no mount
                    </div>
                  </div>
                </header>

                <div className="flex justify-center">
                  <BoardView
                    pieces={pieces}
                    placements={displayedResult.placements}
                    maxHighlightedLines={maxBonusLinesForLevel(mountLevel)}
                  />
                </div>

                <StatsSummary
                  currentStats={currentStats}
                  buffsFromMount={displayedResult.buffsFromMount}
                />

                {displayedResult.unusedPieceIds.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">
                      Unused pieces ({displayedResult.unusedPieceIds.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {displayedResult.unusedPieceIds.map((id) => {
                        const piece = pieces.find((p) => p.id === id)
                        if (!piece) return null
                        return <PieceCard key={id} piece={piece} dim />
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-gray-500 text-right">
                  {displayedResult.mode} mode · {displayedResult.elapsedMs.toFixed(0)}ms
                  {displayedResult.truncated ? ' · timed out, best-so-far' : ''}
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
              Copy this string and share or save it for later import. New
              exports use a compact v2 format; import accepts older v1 exports
              too.
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
              current stats, pieces, optimizer mode, and full-mode time limit.
            </p>

            <textarea
              value={importText}
              onChange={(e) => {
                setImportError(null)
                setImportText(e.target.value)
              }}
              className="w-full h-36 bg-bg-elev border border-bg-line rounded-md p-3 text-xs text-white focus:outline-none focus:border-accent"
              placeholder="mount-opt:v2:..."
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
