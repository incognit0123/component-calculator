import type { MountLevel } from '../data/lineBonuses'
import type { MountKey } from '../data/mounts'
import type { Piece, StatTotals, OptimizerMode } from '../data/types'

export const BOARD_ROWS = 8

export interface Placement {
  pieceId: string
  rotation: number
  row: number
  col: number
}

export interface Layout {
  placements: Placement[]
  /** bitboard of occupied cells, bit = row * cols + col */
  occupancy: bigint
}

/**
 * Result of a single-board solve. Used internally by `solve()` and `solveAll`,
 * which composes per-board solves into an `OptimizerResult`.
 *
 * `buffsFromPieces` reflects the `pieceBuffMultiplier` passed to solve — i.e.
 * for a non-equipped mount it carries sync-rate-scaled values, not full ones.
 * Display code that needs unscaled per-board buffs should derive them from
 * the placement list against the original inventory.
 */
export interface BoardSolveResult {
  placements: Placement[]
  unusedPieceIds: string[]
  beforeScore: number
  afterScore: number
  buffsFromPieces: StatTotals
  buffsFromLines: StatTotals
  linesFilled: number
  elapsedMs: number
  mode: OptimizerMode
  mountKey: MountKey
  truncated: boolean
}

/**
 * Per-mount slice of an `OptimizerResult`. `buffsFromPieces` is always the
 * **full** (unscaled) sum of buffs from this board's pieces — UI scales by
 * `syncRate` at display time when aggregating across boards.
 */
export interface BoardResult {
  mountKey: MountKey
  mountLevel: MountLevel
  isEquipped: boolean
  /** Percentage. 100 for equipped, 20–100 for non-equipped (mount/level dependent). */
  syncRate: number
  placements: Placement[]
  /** Full (unscaled) piece-buff contributions from this board's placed pieces. */
  buffsFromPieces: StatTotals
  /** Line-bonus contributions. Zero for non-equipped (no line bonuses there). */
  buffsFromLines: StatTotals
  linesFilled: number
}

export interface MountConfig {
  mountKey: MountKey
  mountLevel: MountLevel
  isEquipped: boolean
}

export interface OptimizerInput {
  currentStats: StatTotals
  pieces: Piece[]
  mode: OptimizerMode
  /**
   * Every mount whose board the player wants the optimizer to fill. Exactly
   * one entry must have `isEquipped: true`. Order is irrelevant — `solveAll`
   * decides the optimization order itself (equipped first, then non-equipped
   * by descending sync rate).
   */
  mountConfigs: MountConfig[]
  /** Total time budget across **all** boards, not per-board. */
  timeBudgetMs?: number
}

export interface OptimizerResult {
  equippedMountKey: MountKey
  /** Ordered: equipped first, then non-equipped by descending sync rate. */
  boards: BoardResult[]
  /** Pieces left over after every board has been filled. */
  unusedPieceIds: string[]
  /** formula(currentStats) — the no-mount baseline. */
  beforeScore: number
  /** formula(stats accumulated across every board, scaled per sync rate). */
  afterScore: number
  elapsedMs: number
  mode: OptimizerMode
  truncated: boolean
}

export interface ProgressMessage {
  type: 'progress'
  best: OptimizerResult
  explored: number
  /** Mount currently being optimized (when reported mid-orchestration). */
  currentMountKey?: MountKey
}

export interface DoneMessage {
  type: 'done'
  result: OptimizerResult
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type WorkerMessage = ProgressMessage | DoneMessage | ErrorMessage
