import { useEffect, useMemo, useState } from 'react'
import { CurrentStatsPanel } from './components/CurrentStatsPanel'
import { PieceInventory } from './components/PieceInventory'
import { MountPanel } from './components/MountPanel'
import { OptimizerPanel } from './components/OptimizerPanel'
import type { FullTimeLimit, OptimizeScope } from './components/OptimizerPanel'
import { BoardView } from './components/BoardView'
import { MountBoardPreview } from './components/MountBoardPreview'
import { StatsSummary, type StatsTab } from './components/StatsSummary'
import { PieceCard } from './components/PieceCard'
import { PanelShell } from './components/PanelShell'
import {
  MAX_MOUNT_LEVEL,
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
import { QUALITIES } from './data/qualities'
import { SHAPE_KEYS } from './data/shapes'
import { STAT_KEYS, zeroStats } from './data/stats'
import type { Piece, StatTotals } from './data/types'
import { usePersistedState } from './hooks/usePersistedState'
import { useOptimizer } from './hooks/useOptimizer'
import type { BoardResult, MountConfig } from './optimizer/types'

const STATS_KEY = 'mount-opt:current-stats:v1'
const PIECES_KEY = 'mount-opt:pieces:v1'
const LEGACY_MOUNT_LEVEL_KEY = 'mount-opt:mount-level:v1'
const MOUNT_LEVELS_KEY = 'mount-opt:mount-levels:v1'
const SELECTED_MOUNT_KEY = 'mount-opt:selected-mount:v1'
const UNLOCKED_MOUNTS_KEY = 'mount-opt:unlocked-mounts:v1'
const OPTIMIZE_SCOPE_KEY = 'mount-opt:optimize-scope:v1'
const FULL_LIMIT_KEY = 'mount-opt:full-time-limit:v1'
const PROFILES_KEY = 'mount-opt:profiles:v1'
const EXPORT_PREFIX_V1 = 'mount-opt:v1:'
const EXPORT_PREFIX_V2 = 'mount-opt:v2:'
const EXPORT_PREFIX_V3 = 'mount-opt:v3:'
const EXPORT_PREFIX_V4 = 'mount-opt:v4:'
const EXPORT_PREFIX_V5 = 'mount-opt:v5:'
const EXPORT_PREFIX_V6 = 'mount-opt:v6:'

type MountLevelMap = Record<MountKey, MountLevel>
type UnlockedMap = Record<MountKey, boolean>

interface ExportedConfig {
  currentStats: StatTotals
  pieces: Piece[]
  selectedMountKey: MountKey
  mountLevels: MountLevelMap
  unlockedMounts: UnlockedMap
  optimizeScope: OptimizeScope
  fullTimeLimit: FullTimeLimit
}

type CompactScope = 'a' | 'e'
type CompactPiece = [shape: Piece['shape'], quality: Piece['quality'], stat: Piece['stat']]
type CompactZeroOne = 0 | 1
type CompactUnlocked = {
  electricScooter: CompactZeroOne
  techHoverboard: CompactZeroOne
  doomsteed: CompactZeroOne
}

interface ExportedConfigV6 {
  version: 6
  s: number[]
  p: CompactPiece[]
  mt: MountKey
  lv: { electricScooter: number; techHoverboard: number; doomsteed: number }
  u: CompactUnlocked
  os: CompactScope
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
  const compact: ExportedConfigV6 = {
    version: 6,
    s: STAT_KEYS.map((key) => config.currentStats[key]),
    p: config.pieces.map((piece) => [piece.shape, piece.quality, piece.stat]),
    mt: config.selectedMountKey,
    lv: {
      electricScooter: config.mountLevels.electricScooter,
      techHoverboard: config.mountLevels.techHoverboard,
      doomsteed: config.mountLevels.doomsteed,
    },
    u: {
      electricScooter: config.unlockedMounts.electricScooter ? 1 : 0,
      techHoverboard: config.unlockedMounts.techHoverboard ? 1 : 0,
      doomsteed: config.unlockedMounts.doomsteed ? 1 : 0,
    },
    os: config.optimizeScope === 'allUnlocked' ? 'a' : 'e',
    t: [config.fullTimeLimit.enabled ? 1 : 0, config.fullTimeLimit.seconds],
  }
  const json = JSON.stringify(compact)
  const base64 = bytesToBase64(new TextEncoder().encode(json))
  return `${EXPORT_PREFIX_V6}${base64}`
}

function isMountLevel(value: unknown): value is MountLevel {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_MOUNT_LEVEL
  )
}

function isMountLevelMap(value: unknown): value is MountLevelMap {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  return MOUNT_KEYS.every((key) => isMountLevel(record[key]))
}

function isUnlockedMap(value: unknown): value is UnlockedMap {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  return MOUNT_KEYS.every((key) => typeof record[key] === 'boolean')
}

function isOptimizeScope(value: unknown): value is OptimizeScope {
  return value === 'allUnlocked' || value === 'equippedOnly'
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

function defaultMountLevels(): MountLevelMap {
  return { electricScooter: 0, techHoverboard: 0, doomsteed: 0 }
}

/**
 * Default unlocked map: only the given mount key unlocked. Used as the
 * fall-back for users with no `unlocked-mounts:v1` key yet (and for older
 * import versions) so the existing single-mount UI stays identical until
 * the user explicitly unlocks more.
 */
function defaultUnlockedFor(key: MountKey): UnlockedMap {
  return {
    electricScooter: key === 'electricScooter',
    techHoverboard: key === 'techHoverboard',
    doomsteed: key === 'doomsteed',
  }
}

/**
 * Seed the per-mount levels from the legacy single-mount-level localStorage
 * key (used pre v4). Called once at module init; if the v4 key already exists,
 * usePersistedState will overwrite this with the saved value.
 */
function legacySeededMountLevels(): MountLevelMap {
  const out = defaultMountLevels()
  if (typeof window === 'undefined') return out
  try {
    const raw = window.localStorage.getItem(LEGACY_MOUNT_LEVEL_KEY)
    if (raw == null) return out
    const parsed = JSON.parse(raw)
    if (isMountLevel(parsed)) out.electricScooter = parsed
  } catch {
    // ignore
  }
  return out
}

/**
 * Default unlocked-mounts map: read the previously-selected mount key from
 * localStorage and unlock only that one. Existing single-mount users see no
 * UI change until they explicitly unlock another.
 */
function legacySeededUnlocked(): UnlockedMap {
  if (typeof window === 'undefined') return defaultUnlockedFor(DEFAULT_MOUNT_KEY)
  try {
    const raw = window.localStorage.getItem(SELECTED_MOUNT_KEY)
    if (raw == null) return defaultUnlockedFor(DEFAULT_MOUNT_KEY)
    const parsed = JSON.parse(raw)
    if (isMountKey(parsed)) return defaultUnlockedFor(parsed)
  } catch {
    // ignore
  }
  return defaultUnlockedFor(DEFAULT_MOUNT_KEY)
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

  let legacyMountLevel: MountLevel = 0
  if (expectedVersion === 3) {
    if (!isMountLevel(parsed.l)) {
      throw new Error('Import string data is invalid.')
    }
    legacyMountLevel = parsed.l
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
    selectedMountKey: DEFAULT_MOUNT_KEY,
    mountLevels: { ...defaultMountLevels(), electricScooter: legacyMountLevel },
    unlockedMounts: defaultUnlockedFor(DEFAULT_MOUNT_KEY),
    optimizeScope: 'allUnlocked',
    fullTimeLimit: {
      enabled: enabledFlag === 1,
      seconds,
    },
  }
}

function decodeV4Payload(parsed: Record<string, unknown>): ExportedConfig {
  const validBaseShape =
    parsed.version === 4 &&
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
    isMountKey(parsed.mt) &&
    isMountLevelMap(parsed.lv) &&
    Array.isArray(parsed.t) &&
    parsed.t.length === 2 &&
    (parsed.t[0] === 0 || parsed.t[0] === 1) &&
    isFiniteNumber(parsed.t[1]) &&
    parsed.t[1] >= 1

  if (!validBaseShape) throw new Error('Import string data is invalid.')

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

  const selectedMountKey = parsed.mt as MountKey

  return {
    currentStats,
    pieces,
    selectedMountKey,
    mountLevels: parsed.lv as MountLevelMap,
    unlockedMounts: defaultUnlockedFor(selectedMountKey),
    optimizeScope: 'allUnlocked',
    fullTimeLimit: { enabled: enabledFlag === 1, seconds },
  }
}

function decodeV5Payload(parsed: Record<string, unknown>): ExportedConfig {
  const u = parsed.u as Record<string, unknown> | undefined
  const validUnlocked =
    u != null &&
    typeof u === 'object' &&
    MOUNT_KEYS.every((key) => u[key] === 0 || u[key] === 1)
  const validBaseShape =
    parsed.version === 5 &&
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
    isMountKey(parsed.mt) &&
    isMountLevelMap(parsed.lv) &&
    validUnlocked &&
    (parsed.os === 'a' || parsed.os === 'e') &&
    Array.isArray(parsed.t) &&
    parsed.t.length === 2 &&
    (parsed.t[0] === 0 || parsed.t[0] === 1) &&
    isFiniteNumber(parsed.t[1]) &&
    parsed.t[1] >= 1

  if (!validBaseShape) throw new Error('Import string data is invalid.')

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

  const selectedMountKey = parsed.mt as MountKey
  const unlockedMounts: UnlockedMap = {
    electricScooter: u!.electricScooter === 1,
    techHoverboard: u!.techHoverboard === 1,
    doomsteed: u!.doomsteed === 1,
  }
  // Force-unlock the equipped mount: a hand-edited import string could be
  // inconsistent, but the equipped mount must always be unlocked.
  unlockedMounts[selectedMountKey] = true

  return {
    currentStats,
    pieces,
    selectedMountKey,
    mountLevels: parsed.lv as MountLevelMap,
    unlockedMounts,
    optimizeScope: parsed.os === 'a' ? 'allUnlocked' : 'equippedOnly',
    fullTimeLimit: { enabled: enabledFlag === 1, seconds },
  }
}

function decodeV6Payload(parsed: Record<string, unknown>): ExportedConfig {
  const u = parsed.u as Record<string, unknown> | undefined
  const validUnlocked =
    u != null &&
    typeof u === 'object' &&
    MOUNT_KEYS.every((key) => u[key] === 0 || u[key] === 1)
  const validShape =
    parsed.version === 6 &&
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
    isMountKey(parsed.mt) &&
    isMountLevelMap(parsed.lv) &&
    validUnlocked &&
    (parsed.os === 'a' || parsed.os === 'e') &&
    Array.isArray(parsed.t) &&
    parsed.t.length === 2 &&
    (parsed.t[0] === 0 || parsed.t[0] === 1) &&
    isFiniteNumber(parsed.t[1]) &&
    parsed.t[1] >= 1

  if (!validShape) throw new Error('Import string data is invalid.')

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

  const selectedMountKey = parsed.mt as MountKey
  const unlockedMounts: UnlockedMap = {
    electricScooter: u!.electricScooter === 1,
    techHoverboard: u!.techHoverboard === 1,
    doomsteed: u!.doomsteed === 1,
  }
  unlockedMounts[selectedMountKey] = true

  return {
    currentStats,
    pieces,
    selectedMountKey,
    mountLevels: parsed.lv as MountLevelMap,
    unlockedMounts,
    optimizeScope: parsed.os === 'a' ? 'allUnlocked' : 'equippedOnly',
    fullTimeLimit: { enabled: enabledFlag === 1, seconds },
  }
}

function decodeConfig(raw: string): ExportedConfig {
  if (raw.startsWith(EXPORT_PREFIX_V6)) {
    const payload = raw.slice(EXPORT_PREFIX_V6.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>
    return decodeV6Payload(parsed)
  }

  if (raw.startsWith(EXPORT_PREFIX_V5)) {
    const payload = raw.slice(EXPORT_PREFIX_V5.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>
    return decodeV5Payload(parsed)
  }

  if (raw.startsWith(EXPORT_PREFIX_V4)) {
    const payload = raw.slice(EXPORT_PREFIX_V4.length).trim()
    const json = new TextDecoder().decode(base64ToBytes(payload))
    const parsed = JSON.parse(json) as Record<string, unknown>
    return decodeV4Payload(parsed)
  }

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
      selectedMountKey: DEFAULT_MOUNT_KEY,
      mountLevels: defaultMountLevels(),
      unlockedMounts: defaultUnlockedFor(DEFAULT_MOUNT_KEY),
      optimizeScope: 'allUnlocked',
      fullTimeLimit: parsed.fullTimeLimit,
    }
  }

  throw new Error('Unrecognized import string format.')
}

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

  // Active board in the result section. Resets to the result's equipped mount
  // whenever a new result arrives. Distinct from the Mount Panel's
  // selectedMountKey — switching the displayed result board doesn't change
  // what the player has equipped in their game.
  const [displayedMountKey, setDisplayedMountKey] = useState<MountKey | null>(
    null,
  )
  const [activeStatsTab, setActiveStatsTab] = useState<string>('all')

  const result = status.result ?? status.progress?.partial ?? null

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

  const selectedMountLevel = mountLevels[selectedMountKey]
  const unlockedKeys = MOUNT_KEYS.filter((k) => unlockedMounts[k])
  const unlockedCount = unlockedKeys.length

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
    const timeBudgetMs = fullTimeLimit.enabled
      ? fullTimeLimit.seconds * 1000
      : undefined

    const includeNonEquipped =
      optimizeScope === 'allUnlocked' && unlockedCount > 1
    const mountConfigs: MountConfig[] = [
      {
        mountKey: selectedMountKey,
        mountLevel: selectedMountLevel,
        isEquipped: true,
      },
    ]
    if (includeNonEquipped) {
      for (const key of unlockedKeys) {
        if (key === selectedMountKey) continue
        mountConfigs.push({
          mountKey: key,
          mountLevel: mountLevels[key],
          isEquipped: false,
        })
      }
    }

    run({
      currentStats,
      pieces,
      mountConfigs,
      timeBudgetMs,
    })
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
        secondaryLabel: '+ Lines',
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
        secondaryLabel: '+ Lines',
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
              unusedIds={
                new Set(result?.unusedPieceIds ?? [])
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
              multipleMountsUnlocked={unlockedCount > 1}
              scope={optimizeScope}
              onScopeChange={setOptimizeScope}
              boardCount={
                optimizeScope === 'allUnlocked' && unlockedCount > 1
                  ? unlockedCount
                  : 1
              }
              exploredCount={status.progress?.explored}
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
                {status.running && (
                  <div className="text-xs text-accent italic">
                    Preliminary result (still working)…
                  </div>
                )}
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
                    <div className="text-xs text-gray-400">Final score</div>
                    <div className="text-2xl font-bold text-white">
                      {result.afterScore.toFixed(3)}×
                    </div>
                    <div className="text-xs text-accent">
                      {improvementPct(result.beforeScore, result.afterScore)} vs.
                      no mount
                    </div>
                  </div>
                </header>

                <div className="flex flex-col items-center gap-1">
                  <div className="text-sm text-gray-200">
                    {displayedMount.name}
                    {displayedBoard.isEquipped && (
                      <span className="text-gray-500 ml-1">(equipped)</span>
                    )}
                  </div>
                  <BoardView
                    pieces={pieces}
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
                          pieces={pieces}
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
                    currentStats={currentStats}
                    buffsFromPieces={statsViewProps.buffsFromPieces}
                    secondaryValues={statsViewProps.secondaryValues}
                    secondaryKind={statsViewProps.secondaryKind}
                    secondaryLabel={statsViewProps.secondaryLabel}
                    roundContributions={statsViewProps.roundContributions}
                    tabs={statsViewProps.tabs}
                    activeTabId={statsViewProps.activeTabId}
                    onTabChange={setActiveStatsTab}
                  />
                )}

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
                  {result.elapsedMs.toFixed(0)}ms
                  {result.truncated ? ' · timed out, best-so-far' : ''}
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
