import { describe, expect, it } from 'vitest'
import { zeroStats } from '../data/stats'
import type { Piece } from '../data/types'
import { solve } from './solve'

function mkPiece(
  id: string,
  shape: Piece['shape'],
  quality: Piece['quality'],
  stat: Piece['stat'],
): Piece {
  return { id, shape, quality, stat }
}

describe('optimizer integration', () => {
  it('full >= normal >= baseline on a fixture', { timeout: 30000 }, async () => {
    const currentStats = zeroStats()
    currentStats.critDamage = 100
    currentStats.skillDamage = 50

    const pieces: Piece[] = [
      mkPiece('a', 'O', 'legend', 'critDamage'),
      mkPiece('b', 'I', 'epicPlus', 'skillDamage'),
      mkPiece('c', 'T', 'epic', 'shieldDamage'),
      mkPiece('d', 'L', 'excellent', 'laceration'),
      mkPiece('e', 'J', 'better', 'toBosses'),
      mkPiece('f', 'O', 'good', 'toWeakened'),
    ]

    const full = await solve(pieces, currentStats, { mode: 'full' })
    const normal = await solve(pieces, currentStats, { mode: 'normal' })

    expect(normal.afterScore).toBeGreaterThanOrEqual(normal.beforeScore)
    expect(full.afterScore).toBeGreaterThanOrEqual(full.beforeScore)

    const eps = 1e-9
    expect(full.afterScore + eps).toBeGreaterThanOrEqual(normal.afterScore)
  })

  it('full mode finds the optimum on a tiny fixture', async () => {
    const currentStats = zeroStats()
    const pieces: Piece[] = [
      mkPiece('a', 'O', 'legend', 'critDamage'),
      mkPiece('b', 'O', 'legend', 'skillDamage'),
      mkPiece('c', 'O', 'good', 'shieldDamage'),
    ]
    const full = await solve(pieces, currentStats, { mode: 'full' })
    // All three pieces fit, no full rows. Expected score:
    // (1 + 33/100) * (1 + 42/100) * (1 + 5/100) = 1.33 * 1.42 * 1.05
    expect(full.afterScore).toBeCloseTo(1.33 * 1.42 * 1.05, 8)
    expect(full.placements.length).toBe(3)
  })

  it('placed + unused pieces partition the inventory', async () => {
    const pieces: Piece[] = [
      mkPiece('a', 'O', 'legend', 'critDamage'),
      mkPiece('b', 'O', 'legend', 'skillDamage'),
      mkPiece('c', 'O', 'good', 'shieldDamage'),
      mkPiece('d', 'O', 'good', 'laceration'),
      mkPiece('e', 'O', 'good', 'toBosses'),
    ]
    const result = await solve(pieces, zeroStats(), { mode: 'normal' })
    const placedIds = new Set(result.placements.map((p) => p.pieceId))
    const allReportedIds = new Set([...placedIds, ...result.unusedPieceIds])
    expect(allReportedIds.size).toBe(pieces.length)
    expect(result.mode).toBe('normal')
  })
})
