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

export interface OptimizerInput {
  currentStats: StatTotals
  pieces: Piece[]
  mode: OptimizerMode
  mountKey: MountKey
  mountLevel: MountLevel
  timeBudgetMs?: number
}

export interface OptimizerResult {
  placements: Placement[]
  unusedPieceIds: string[]
  beforeScore: number
  afterScore: number
  buffsFromMount: StatTotals
  linesFilled: number
  elapsedMs: number
  mode: OptimizerMode
  mountKey: MountKey
  truncated: boolean
}

export interface ProgressMessage {
  type: 'progress'
  best: OptimizerResult
  explored: number
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
