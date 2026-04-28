import { describe, expect, it } from 'vitest'
import { MOUNTS } from '../data/mounts'
import { zeroStats } from '../data/stats'
import type { Piece, QualityTier, ShapeKey, StatKey } from '../data/types'
import { formula, scoreLayout } from './scoring'
import { solve } from './solve'

const ES_TIERS = MOUNTS.electricScooter.lineBonusTiers
const DS_TIERS = MOUNTS.doomsteed.lineBonusTiers

let nextId = 0
function mk(shape: ShapeKey, quality: QualityTier, stat: StatKey): Piece {
  return { id: `p${++nextId}`, shape, quality, stat }
}

describe('solve', () => {
  it('returns the no-pieces baseline for an empty inventory', async () => {
    const stats = zeroStats()
    stats.critDamage = 100
    const result = await solve([], stats)
    expect(result.placements).toEqual([])
    expect(result.unusedPieceIds).toEqual([])
    expect(result.afterScore).toBeCloseTo(formula(stats), 10)
    expect(result.beforeScore).toBeCloseTo(formula(stats), 10)
    expect(result.mountKey).toBe('electricScooter')
  })

  it('places all inventory pieces when K < G (small inventory)', async () => {
    const inventory = [
      mk('O', 'legend', 'critDamage'),
      mk('I', 'legend', 'skillDamage'),
      mk('T', 'epic', 'shieldDamage'),
    ]
    const result = await solve(inventory, zeroStats())
    expect(result.placements.length).toBe(3)
    expect(result.unusedPieceIds.length).toBe(0)
    expect(result.afterScore).toBeCloseTo(
      scoreLayout(zeroStats(), inventory, result.linesFilled, ES_TIERS, 0),
      10,
    )
  })

  it('result placements all reference inventory pieces', async () => {
    const inventory = [
      mk('O', 'legend', 'critDamage'),
      mk('O', 'epic', 'skillDamage'),
      mk('I', 'legend', 'shieldDamage'),
      mk('T', 'epicPlus', 'laceration'),
    ]
    const result = await solve(inventory, zeroStats())
    const ids = new Set(inventory.map((p) => p.id))
    for (const pl of result.placements) {
      expect(ids.has(pl.pieceId)).toBe(true)
    }
  })

  it('placements + unused covers every inventory piece exactly once', async () => {
    const inventory = [
      mk('O', 'legend', 'critDamage'),
      mk('I', 'legend', 'skillDamage'),
      mk('T', 'epic', 'shieldDamage'),
      mk('L', 'excellent', 'laceration'),
      mk('J', 'better', 'toBosses'),
      mk('O', 'good', 'toWeakened'),
    ]
    const result = await solve(inventory, zeroStats())
    const placed = new Set(result.placements.map((p) => p.pieceId))
    const all = new Set([...placed, ...result.unusedPieceIds])
    expect(all.size).toBe(inventory.length)
  })

  it('full mode is at least as good as normal mode on a fixture', async () => {
    const stats = zeroStats()
    stats.critDamage = 100
    stats.skillDamage = 50
    const inventory: Piece[] = [
      mk('O', 'legend', 'critDamage'),
      mk('I', 'epicPlus', 'skillDamage'),
      mk('T', 'epic', 'shieldDamage'),
      mk('L', 'excellent', 'laceration'),
      mk('J', 'better', 'toBosses'),
      mk('O', 'good', 'toWeakened'),
    ]
    const full = await solve(inventory, stats, { mode: 'full' })
    const normal = await solve(inventory, stats, { mode: 'normal' })
    expect(full.afterScore).toBeGreaterThanOrEqual(normal.afterScore - 1e-9)
    expect(normal.afterScore).toBeGreaterThanOrEqual(normal.beforeScore)
  })

  it('full mode finds a valid optimum on a 3-piece fixture', async () => {
    const inventory: Piece[] = [
      mk('O', 'legend', 'critDamage'),
      mk('O', 'legend', 'skillDamage'),
      mk('O', 'good', 'shieldDamage'),
    ]
    const result = await solve(inventory, zeroStats(), { mode: 'full' })
    expect(result.placements.length).toBe(3)
    expect(result.linesFilled).toBe(0)
    expect(result.afterScore).toBeCloseTo(1.33 * 1.42 * 1.05, 8)
  })

  it('handles a 14+ inventory (K >= G) without timing out', async () => {
    const inventory: Piece[] = []
    const stats: ('critDamage' | 'skillDamage' | 'shieldDamage' | 'laceration' | 'toBosses')[] =
      ['critDamage', 'skillDamage', 'shieldDamage', 'laceration', 'toBosses']
    const shapes: ShapeKey[] = ['O', 'I', 'T', 'L', 'J']
    const qualities: QualityTier[] = [
      'good',
      'better',
      'excellent',
      'excellentPlus',
      'epic',
      'epicPlus',
      'legend',
    ]
    for (let i = 0; i < 18; i++) {
      inventory.push(
        mk(
          shapes[i % shapes.length],
          qualities[i % qualities.length],
          stats[i % stats.length],
        ),
      )
    }
    const t0 = performance.now()
    const result = await solve(inventory, zeroStats(), { mode: 'full' })
    const elapsed = performance.now() - t0
    expect(result.placements.length).toBeGreaterThan(0)
    expect(result.afterScore).toBeGreaterThan(result.beforeScore)
    expect(elapsed).toBeLessThan(10000)
  }, 30000)

  it('higher mount level cannot decrease the optimum', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 18; i++) {
      inventory.push(mk('O', 'legend', 'critDamage'))
    }
    const lvl0 = await solve(inventory, zeroStats(), {
      mode: 'full',
      mountLevel: 0,
    })
    const lvl8 = await solve(inventory, zeroStats(), {
      mode: 'full',
      mountLevel: 8,
    })
    expect(lvl8.afterScore).toBeGreaterThanOrEqual(lvl0.afterScore - 1e-9)
  })

  it('mount level 8 fires the level-gated tiers when lines >= 5', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 14; i++) inventory.push(mk('I', 'legend', 'critDamage'))

    const lvl8 = await solve(inventory, zeroStats(), {
      mode: 'full',
      mountLevel: 8,
    })
    expect(lvl8.linesFilled).toBeGreaterThanOrEqual(0)
    if (lvl8.linesFilled >= 5) {
      expect(lvl8.buffsFromMount.laceration).toBeGreaterThan(0)
    }
  })

  it('respects isCancelled', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 18; i++) {
      inventory.push(mk('O', 'legend', 'critDamage'))
    }
    let calls = 0
    const result = await solve(inventory, zeroStats(), {
      mode: 'full',
      isCancelled: () => ++calls > 2,
    })
    expect(result.mode).toBe('full')
    expect(typeof result.afterScore).toBe('number')
  })

  it('Doomsteed (12-wide) places more pieces than Electric Scooter on the same inventory', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) inventory.push(mk('I', 'legend', 'toPoisoned'))

    const es = await solve(inventory, zeroStats(), {
      mode: 'normal',
      mountKey: 'electricScooter',
      mountLevel: 0,
    })
    const ds = await solve(inventory, zeroStats(), {
      mode: 'normal',
      mountKey: 'doomsteed',
      mountLevel: 0,
    })

    expect(es.mountKey).toBe('electricScooter')
    expect(ds.mountKey).toBe('doomsteed')
    expect(ds.placements.length).toBeGreaterThanOrEqual(es.placements.length)
  }, 30000)

  it('Doomsteed level 8 with 8 filled lines triggers the dynamic toBosses tier', async () => {
    // Inventory of 24 I-pieces buffing toPoisoned. With Doomsteed lvl8 and
    // 8 lines filled, line bonuses alone push toPoisoned past 160 → +5 toBosses
    // from the dynamic tier, plus +5 from the static 7-line tier = +10 minimum.
    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) inventory.push(mk('I', 'legend', 'toPoisoned'))

    const result = await solve(inventory, zeroStats(), {
      mode: 'normal',
      mountKey: 'doomsteed',
      mountLevel: 8,
    })

    expect(result.linesFilled).toBe(8)
    expect(result.buffsFromMount.toBosses).toBeGreaterThanOrEqual(10)

    // Cross-check: scoreLayout with the same inputs matches.
    const placedPieces = result.placements
      .map((pl) => inventory.find((p) => p.id === pl.pieceId))
      .filter((p): p is Piece => p != null)
    expect(result.afterScore).toBeCloseTo(
      scoreLayout(zeroStats(), placedPieces, result.linesFilled, DS_TIERS, 8),
      8,
    )
  }, 30000)
})
