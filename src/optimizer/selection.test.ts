import { describe, expect, it } from 'vitest'
import { BUFF_TABLE } from '../data/buffTable'
import { MOUNTS } from '../data/mounts'
import { zeroStats } from '../data/stats'
import type { Piece, QualityTier, ShapeKey, StatKey } from '../data/types'
import { applyLineBonuses, formula, scoreLayout } from './scoring'
import { selectPieces } from './selection'
import { emptyShapeCounts, type ShapeCounts } from './tiling'

const ES_TIERS = MOUNTS.electricScooter.lineBonusTiers

let nextId = 0
function mk(shape: ShapeKey, quality: QualityTier, stat: StatKey): Piece {
  return { id: `p${++nextId}`, shape, quality, stat }
}

function counts(parts: Partial<ShapeCounts>): ShapeCounts {
  return { ...emptyShapeCounts(), ...parts }
}

describe('selectPieces', () => {
  it('returns the line-bonus-only baseline for an empty distribution', () => {
    const result = selectPieces(
      [mk('O', 'legend', 'critDamage')],
      counts({}),
      4,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks).toEqual([])
    const expected = zeroStats()
    applyLineBonuses(expected, 4, ES_TIERS, 0)
    expect(result.score).toBeCloseTo(formula(expected), 10)
  })

  it('picks the only feasible selection when dist matches inventory', () => {
    const pieces = [
      mk('O', 'legend', 'critDamage'),
      mk('I', 'legend', 'skillDamage'),
    ]
    const result = selectPieces(
      pieces,
      counts({ O: 1, I: 1 }),
      0,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks.length).toBe(2)
    expect(result.score).toBeCloseTo(
      scoreLayout(zeroStats(), pieces, 0, ES_TIERS, 0),
      10,
    )
  })

  it('picks the highest-buff piece when slots < inventory', () => {
    const best = mk('O', 'legend', 'critDamage')
    const worst = mk('O', 'good', 'toBosses')
    const result = selectPieces(
      [best, worst],
      counts({ O: 1 }),
      0,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks).toEqual([best])
    expect(result.score).toBeCloseTo(
      scoreLayout(zeroStats(), [best], 0, ES_TIERS, 0),
      10,
    )
  })

  it('prefers diversifying stats over stacking the same stat', () => {
    const a = mk('O', 'legend', 'critDamage')
    const b = mk('O', 'legend', 'skillDamage')
    const c = mk('O', 'good', 'critDamage')
    const result = selectPieces(
      [a, b, c],
      counts({ O: 2 }),
      0,
      zeroStats(),
      ES_TIERS,
      0,
    )
    const ids = new Set(result.picks.map((p) => p.id))
    expect(ids).toEqual(new Set([a.id, b.id]))
    expect(result.score).toBeCloseTo(
      scoreLayout(zeroStats(), [a, b], 0, ES_TIERS, 0),
      10,
    )
  })

  it('respects per-shape quotas', () => {
    const o1 = mk('O', 'legend', 'critDamage')
    const o2 = mk('O', 'legend', 'skillDamage')
    const i1 = mk('I', 'good', 'toBosses')
    const result = selectPieces(
      [o1, o2, i1],
      counts({ O: 1, I: 1 }),
      0,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks.length).toBe(2)
    const shapeCounts = result.picks.reduce<Record<string, number>>((acc, p) => {
      acc[p.shape] = (acc[p.shape] ?? 0) + 1
      return acc
    }, {})
    expect(shapeCounts.O).toBe(1)
    expect(shapeCounts.I).toBe(1)
    expect(result.picks).toContain(i1)
  })

  it('applies line bonuses when scoring', () => {
    const p = mk('O', 'legend', 'critDamage')
    const noLines = selectPieces([p], counts({ O: 1 }), 0, zeroStats(), ES_TIERS, 0)
    const withLines = selectPieces([p], counts({ O: 1 }), 4, zeroStats(), ES_TIERS, 0)
    expect(withLines.score).toBeGreaterThan(noLines.score)
    expect(withLines.score).toBeCloseTo(
      scoreLayout(zeroStats(), [p], 4, ES_TIERS, 0),
      10,
    )
  })

  it('respects already-present currentStats', () => {
    const high = zeroStats()
    high.critDamage = 200
    const critPiece = mk('O', 'legend', 'critDamage')
    const skillPiece = mk('O', 'legend', 'skillDamage')
    const result = selectPieces(
      [critPiece, skillPiece],
      counts({ O: 1 }),
      0,
      high,
      ES_TIERS,
      0,
    )
    expect(result.picks).toEqual([skillPiece])
  })

  it('considers stacking the same stat when only same-stat options exist', () => {
    const a = mk('O', 'legend', 'critDamage')
    const b = mk('O', 'good', 'critDamage')
    const c = mk('I', 'legend', 'critDamage')
    const result = selectPieces(
      [a, b, c],
      counts({ O: 2, I: 1 }),
      0,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks.length).toBe(3)
    const totalCrit =
      BUFF_TABLE.legend.critDamage * 2 + BUFF_TABLE.good.critDamage
    expect(result.score).toBeCloseTo(1 + totalCrit / 100, 10)
  })

  it('finds the optimum on a small mixed inventory', () => {
    const inventory = [
      mk('O', 'legend', 'critDamage'),
      mk('O', 'epic', 'skillDamage'),
      mk('I', 'legend', 'skillDamage'),
      mk('I', 'good', 'toBosses'),
      mk('T', 'epicPlus', 'shieldDamage'),
      mk('L', 'excellent', 'laceration'),
    ]
    const result = selectPieces(
      inventory,
      counts({ O: 1, I: 1, T: 1, L: 1 }),
      2,
      zeroStats(),
      ES_TIERS,
      0,
    )
    expect(result.picks.length).toBe(4)
    expect(result.score).toBeCloseTo(
      scoreLayout(zeroStats(), result.picks, 2, ES_TIERS, 0),
      10,
    )
    const ids = new Set(result.picks.map((p) => p.id))
    expect(ids).toEqual(
      new Set([
        inventory[0].id,
        inventory[2].id,
        inventory[4].id,
        inventory[5].id,
      ]),
    )
  })
})
