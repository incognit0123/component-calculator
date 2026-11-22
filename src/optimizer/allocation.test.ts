import { describe, expect, it } from 'vitest'
import { BUFF_TABLE } from '../data/buffTable'
import { MOUNTS, syncRateFor } from '../data/mounts'
import { SHAPE_ROTATIONS } from '../data/shapes'
import { STAT_KEYS, zeroStats } from '../data/stats'
import type { Piece, StatTotals } from '../data/types'
import { solveAll } from './solveAll'
import type { MountConfig, OptimizerResult } from './types'

const configs: MountConfig[] = [
  { mountKey: 'electricScooter', mountLevel: 0, isEquipped: true },
  { mountKey: 'doomsteed', mountLevel: 0, isEquipped: false },
]

function pieces(count: number, stat: Piece['stat'], shape: Piece['shape'] = 'I'): Piece[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${shape}-${stat}-${i}`, shape, stat, quality: 'legend' }))
}

function expectValidBoards(result: OptimizerResult, inventory: Piece[]): void {
  const byId = new Map(inventory.map((piece) => [piece.id, piece]))
  for (const board of result.boards) {
    const cells = new Set<string>()
    for (const placement of board.placements) {
      const piece = byId.get(placement.pieceId)!
      for (const [dr, dc] of SHAPE_ROTATIONS[piece.shape][placement.rotation]) {
        const row = placement.row + dr
        const col = placement.col + dc
        expect(row).toBeGreaterThanOrEqual(0)
        expect(row).toBeLessThan(8)
        expect(col).toBeGreaterThanOrEqual(0)
        expect(col).toBeLessThan(MOUNTS[board.mountKey].cols)
        expect(cells.has(`${row},${col}`)).toBe(false)
        cells.add(`${row},${col}`)
      }
    }
  }
}

// With 36 I pieces, 12–14 fit on the Scooter and the rest fit on Doomsteed.
// Each split can fill at least four Scooter rows (all available line bonuses).
function referenceIAllocation(stats: StatTotals, sync: number): number {
  let best = 0
  for (let equippedCount = 12; equippedCount <= 14; equippedCount++) {
    for (let chilled = 0; chilled <= 10; chilled++) {
      const skill = equippedCount - chilled
      const skillTotal = stats.skillDamage + 42 * (skill + (26 - skill) * sync)
      const debuffTotal = stats.toWeakened + stats.toPoisoned + stats.toChilled + 25 + 42 * (chilled + (10 - chilled) * sync)
      const score = (1 + (stats.critDamage + 55) / 100) * (1 + skillTotal / 100) *
        (1 + stats.shieldDamage / 100) * (1 + stats.laceration / 100) *
        (1 + stats.toBosses / 100) * (1 + debuffTotal / 100)
      best = Math.max(best, score)
    }
  }
  return best
}

/** Tiny independent oracle: enumerate individual legal placements on every
 * board, plus leaving a piece unused. No optimizer/tiling/scoring code is used. */
function bruteForce(inventory: Piece[], mounts: MountConfig[]): number {
  const occupied = mounts.map(() => 0n)
  const totals = mounts.map(() => zeroStats())
  const placements = inventory.map((piece) => mounts.map((mount) => {
    const masks: bigint[] = []
    const cols = MOUNTS[mount.mountKey].cols
    for (const cells of SHAPE_ROTATIONS[piece.shape]) {
      const height = Math.max(...cells.map(([r]) => r)) + 1
      const width = Math.max(...cells.map(([, c]) => c)) + 1
      for (let row = 0; row + height <= 8; row++) {
        for (let col = 0; col + width <= cols; col++) {
          let mask = 0n
          for (const [dr, dc] of cells) mask |= 1n << BigInt((row + dr) * cols + col + dc)
          masks.push(mask)
        }
      }
    }
    return masks
  }))
  let best = 1
  function visit(index: number): void {
    if (index === inventory.length) {
      const stats = zeroStats()
      for (let board = 0; board < mounts.length; board++) {
        const mount = mounts[board]
        const spec = MOUNTS[mount.mountKey]
        const rate = mount.isEquipped ? 1 : syncRateFor(mount.mountKey, mount.mountLevel) / 100
        for (const key of STAT_KEYS) stats[key] += totals[board][key] * rate
        if (!mount.isEquipped) continue
        let lines = 0
        for (let row = 0; row < 8; row++) {
          const rowMask = ((1n << BigInt(spec.cols)) - 1n) << BigInt(row * spec.cols)
          if ((occupied[board] & rowMask) === rowMask) lines++
        }
        for (const tier of spec.lineBonusTiers) {
          if (lines < tier.minLines || mount.mountLevel < tier.unlockedAtLevel) continue
          const bonus = tier.bonus ?? tier.compute?.(stats) ?? {}
          for (const key of STAT_KEYS) stats[key] += bonus[key] ?? 0
        }
      }
      best = Math.max(best,
        (1 + stats.critDamage / 100) * (1 + stats.skillDamage / 100) *
        (1 + stats.shieldDamage / 100) * (1 + stats.laceration / 100) *
        (1 + stats.toBosses / 100) * (1 + (stats.toWeakened + stats.toPoisoned + stats.toChilled) / 100),
      )
      return
    }
    visit(index + 1)
    const piece = inventory[index]
    const buff = BUFF_TABLE[piece.quality][piece.stat]
    for (let board = 0; board < mounts.length; board++) {
      const previous = totals[board][piece.stat]
      totals[board][piece.stat] += buff
      for (const mask of placements[index][board]) {
        if ((occupied[board] & mask) !== 0n) continue
        occupied[board] |= mask
        visit(index + 1)
        occupied[board] ^= mask
      }
      totals[board][piece.stat] = previous
    }
  }
  visit(0)
  return best
}

describe('allocation refinement against independent references', () => {
  const inventory = [...pieces(26, 'skillDamage'), ...pieces(10, 'toChilled')]

  it('repairs the sequential-allocation counterexample with cross-mount refinement', async () => {
    const result = await solveAll(inventory, zeroStats(), configs)
    expect(result.afterScore).toBeCloseTo(referenceIAllocation(zeroStats(), 0.6), 8)
    expect(result.boards[0].placements.filter((p) => p.pieceId.includes('toChilled'))).toHaveLength(10)
    expectValidBoards(result, inventory)
  })

  it.each([
    [0, 0, 4], [200, 0, 0], [0, 250, 8], [350, 150, 4],
  ])('matches the independent allocation reference (skill=%i, chilled=%i, level=%i)', async (skill, chilled, level) => {
    const stats = { ...zeroStats(), skillDamage: skill, toChilled: chilled }
    const mounts = [configs[0], { ...configs[1], mountLevel: level as MountConfig['mountLevel'] }]
    const result = await solveAll(inventory, stats, mounts, { timeBudgetMs: 10_000 })
    expect(result.afterScore).toBeCloseTo(referenceIAllocation(stats, syncRateFor('doomsteed', mounts[1].mountLevel) / 100), 8)
    const ids = [...result.boards.flatMap((b) => b.placements.map((p) => p.pieceId)), ...result.unusedPieceIds]
    expect(ids).toHaveLength(inventory.length)
    expect(new Set(ids).size).toBe(inventory.length)
    expectValidBoards(result, inventory)
  })

  it.each([0, 8] as const)('matches exhaustive individual placements on a tiny inventory at sync level %i', async (level) => {
    const tiny = [...pieces(1, 'skillDamage', 'I'), ...pieces(1, 'toChilled', 'T')]
    const mounts = [configs[0], { ...configs[1], mountLevel: level }]
    const result = await solveAll(tiny, zeroStats(), mounts)
    expect(result.afterScore).toBeCloseTo(bruteForce(tiny, mounts), 9)
    expect(result.boards[1].placements).toHaveLength(level === 8 ? 2 : 0)
    expectValidBoards(result, tiny)
  })

  it('evaluates poison thresholds exactly when choosing a full Doomsteed board', async () => {
    const inv = [...pieces(20, 'critDamage'), ...pieces(4, 'skillDamage'), ...pieces(4, 'toPoisoned')]
    const stats = { ...zeroStats(), toPoisoned: 90 }
    let expected = 0
    for (let crit = 0; crit <= 20; crit++) {
      for (let skill = 0; skill <= 4; skill++) {
        const poison = 24 - crit - skill
        if (poison < 0 || poison > 4) continue
        const poisonTotal = 90 + 200 + poison * 42
        const boss = 5 + Math.min(25, Math.floor(poisonTotal / 160) * 5)
        expected = Math.max(expected, (1 + crit * 0.33) * (3 + skill * 0.42) * 1.3 * (1 + boss / 100) * (1 + poisonTotal / 100))
      }
    }
    const result = await solveAll(inv, stats, [{ mountKey: 'doomsteed', mountLevel: 8, isEquipped: true }])
    expect(result.afterScore).toBeCloseTo(expected, 8)
  })

})
