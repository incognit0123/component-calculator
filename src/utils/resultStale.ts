import type { Piece } from '../data/types'
import type { OptimizerResult } from '../optimizer/types'

/**
 * True when the inventory no longer matches the one the result was computed
 * from: a placed/unused piece was deleted, or a piece was added that the run
 * never saw. The result is frozen, so its board, stats and score would
 * otherwise silently disagree with the inventory (e.g. a deleted placed piece
 * vanishes from the board while still counting toward the stats).
 */
export function isResultStale(
  result: OptimizerResult,
  pieces: Piece[],
): boolean {
  const known = new Set<string>(result.unusedPieceIds)
  for (const board of result.boards) {
    for (const pl of board.placements) known.add(pl.pieceId)
  }
  const current = new Set(pieces.map((p) => p.id))
  if (current.size !== known.size) return true
  for (const id of known) if (!current.has(id)) return true
  return false
}
