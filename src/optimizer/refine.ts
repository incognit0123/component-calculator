import { BUFF_TABLE } from '../data/buffTable'
import { MOUNTS } from '../data/mounts'
import { MIN_PIECE_CELLS, SHAPE_ROTATIONS } from '../data/shapes'
import { DEBUFF_PRIORITY, debuffPriorityFor, prefersDebuffs, zeroStats } from '../data/stats'
import type { Piece, StatTotals } from '../data/types'
import { bitFor, boardBits, countFullRows, placementsForShape } from './board'
import { addPieceBuffs, evaluateBoards } from './scoring'
import type { BoardResult, OptimizerResult, Placement } from './types'

interface RefineOptions {
  deadline: number
  started: number
  isCancelled?: () => boolean
  onProgress?: (best: OptimizerResult, explored: number) => void
}

function pieceMask(piece: Piece, placement: Placement, cols: number): bigint {
  return SHAPE_ROTATIONS[piece.shape][placement.rotation].reduce(
    (mask, [r, c]) => mask | bitFor(placement.row + r, placement.col + c, cols),
    0n,
  )
}

/** The equipped-first seed can leave empty slots worth more than equipped slots. */
function movePiecesToHigherSyncBoards(
  boards: BoardResult[],
  byId: ReadonlyMap<string, Piece>,
  currentStats: StatTotals,
  opts: RefineOptions,
): void {
  const widths = boards.map((board) => MOUNTS[board.mountKey].cols)
  const receivers = boards.map((_, index) => index).filter((index) =>
    boards[index].syncRate > 100 && boards[index].placements.length * MIN_PIECE_CELLS < boardBits(widths[index]),
  )
  if (receivers.length === 0) return

  const occupied = boards.map((board, index) => board.placements.reduce(
    (mask, placement) => mask | pieceMask(byId.get(placement.pieceId)!, placement, widths[index]),
    0n,
  ))
  let bestScore = evaluateBoards(currentStats, boards).score
  for (const to of receivers) {
    for (const [from, donor] of boards.entries()) {
      if (donor.syncRate >= boards[to].syncRate) continue
      for (const placement of donor.placements) {
        if (performance.now() >= opts.deadline || opts.isCancelled?.()) return
        const piece = byId.get(placement.pieceId)!
        const slot = placementsForShape(piece.shape, widths[to]).find(({ mask }) => (mask & occupied[to]) === 0n)
        if (!slot) continue

        const source = boards[from]
        const destination = boards[to]
        const sourceMask = occupied[from] & ~pieceMask(piece, placement, widths[from])
        const destinationMask = occupied[to] | slot.mask
        const buff = BUFF_TABLE[piece.quality][piece.stat]
        boards[from] = {
          ...source,
          placements: source.placements.filter((placed) => placed.pieceId !== piece.id),
          buffsFromPieces: { ...source.buffsFromPieces, [piece.stat]: source.buffsFromPieces[piece.stat] - buff },
          linesFilled: countFullRows(sourceMask, widths[from]),
        }
        boards[to] = {
          ...destination,
          placements: [...destination.placements, { pieceId: piece.id, rotation: slot.rotation, row: slot.row, col: slot.col }],
          buffsFromPieces: { ...destination.buffsFromPieces, [piece.stat]: destination.buffsFromPieces[piece.stat] + buff },
          linesFilled: countFullRows(destinationMask, widths[to]),
        }
        const { score } = evaluateBoards(currentStats, boards)
        if (score <= bestScore) {
          boards[from] = source
          boards[to] = destination
          continue
        }
        bestScore = score
        occupied[from] = sourceMask
        occupied[to] = destinationMask
      }
    }
  }
}

/** Improve the complete allocation with score-improving moves and same-shape swaps. */
export async function refineAllocation(
  inventory: Piece[],
  currentStats: StatTotals,
  initial: OptimizerResult,
  opts: RefineOptions,
): Promise<OptimizerResult> {
  const byId = new Map(inventory.map((p) => [p.id, p]))
  const debuffPriority = debuffPriorityFor(currentStats)
  const boards = initial.boards.map((b) => ({
    ...b,
    placements: b.placements.map((p) => ({ ...p })),
    buffsFromPieces: { ...b.buffsFromPieces },
  }))
  if (!initial.truncated) movePiecesToHigherSyncBoards(boards, byId, currentStats, opts)
  const entries = boards.flatMap((b, board) => b.placements.map((placement) => ({
    board, placement, piece: byId.get(placement.pieceId)!,
  })))
  const placedCount = entries.length
  const used = new Set(entries.map((e) => e.piece.id))
  entries.push(...inventory.filter((p) => !used.has(p.id)).map((piece) => ({
    board: -1, placement: { pieceId: piece.id, rotation: 0, row: 0, col: 0 }, piece,
  })))
  let bestScore = evaluateBoards(currentStats, boards).score
  let explored = 0
  let lastYield = performance.now()
  let lastProgress = -Infinity

  function snapshot(): OptimizerResult {
    const evaluated = evaluateBoards(currentStats, boards.map((board) => ({
      ...board,
      placements: board.placements.map((p) => ({ ...p })),
      buffsFromPieces: { ...board.buffsFromPieces },
    })))
    return {
      ...initial,
      boards: evaluated.boards,
      afterScore: evaluated.score,
      unusedPieceIds: entries.filter((e) => e.board < 0).map((e) => e.piece.id),
      elapsedMs: performance.now() - opts.started,
      stopReason: opts.isCancelled?.() ? 'cancelled' : initial.stopReason,
    }
  }

  while (performance.now() < opts.deadline && !opts.isCancelled?.()) {
    let bestPair: [number, number] | undefined
    let candidateScore = bestScore
    let candidateStats = evaluateBoards(currentStats, boards).finalStats
    let stopped = false
    for (let i = 0; i < placedCount && !stopped; i++) {
      const a = entries[i]
      for (let j = i + 1; j < entries.length; j++) {
        if (++explored % 256 === 0) {
          if (performance.now() - lastYield >= 8) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
            lastYield = performance.now()
          }
          if (performance.now() - lastProgress >= 400) {
            opts.onProgress?.(snapshot(), explored)
            lastProgress = performance.now()
          }
          if (performance.now() >= opts.deadline || opts.isCancelled?.()) {
            stopped = true
            break
          }
        }
        const b = entries[j]
        if (a.board === b.board || a.piece.shape !== b.piece.shape) continue
        if (a.piece.stat === b.piece.stat && a.piece.quality === b.piece.quality) continue
        const aStats = boards[a.board].buffsFromPieces
        const bStats = b.board < 0 ? undefined : boards[b.board].buffsFromPieces
        const aBuff = BUFF_TABLE[a.piece.quality][a.piece.stat]
        const bBuff = BUFF_TABLE[b.piece.quality][b.piece.stat]
        boards[a.board].buffsFromPieces = {
          ...aStats,
          [a.piece.stat]: aStats[a.piece.stat] - aBuff,
        }
        boards[a.board].buffsFromPieces[b.piece.stat] += bBuff
        if (bStats) {
          boards[b.board].buffsFromPieces = { ...bStats, [b.piece.stat]: bStats[b.piece.stat] - bBuff }
          boards[b.board].buffsFromPieces[a.piece.stat] += aBuff
        }
        const { score, finalStats } = evaluateBoards(currentStats, boards)
        boards[a.board].buffsFromPieces = aStats
        if (bStats) boards[b.board].buffsFromPieces = bStats
        const epsilon = Math.max(1, candidateScore) * 1e-12
        const sameGrade = a.piece.quality === b.piece.quality
        const elementalSwap = DEBUFF_PRIORITY.includes(a.piece.stat) && DEBUFF_PRIORITY.includes(b.piece.stat)
        const preferredTie = Math.abs(score - candidateScore) <= epsilon && sameGrade &&
          (score > bestScore + epsilon || elementalSwap) &&
          prefersDebuffs(finalStats, candidateStats, debuffPriority)
        if (score > candidateScore + epsilon || preferredTie) {
          candidateScore = score
          candidateStats = finalStats
          bestPair = [i, j]
        }
      }
    }
    if (!bestPair) break
    const [a, b] = bestPair.map((i) => entries[i])
    const piece = a.piece
    a.piece = b.piece
    b.piece = piece
    a.placement.pieceId = a.piece.id
    b.placement.pieceId = b.piece.id
    for (let i = 0; i < boards.length; i++) {
      const buffs = zeroStats()
      addPieceBuffs(buffs, entries.filter((e) => e.board === i).map((e) => e.piece))
      boards[i].buffsFromPieces = buffs
    }
    bestScore = evaluateBoards(currentStats, boards).score
    if (stopped) break
  }
  return snapshot()
}
