import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncRateFor } from '../data/mounts'
import { zeroStats } from '../data/stats'
import type { Piece } from '../data/types'
import { formula } from './scoring'
import * as solveModule from './solve'
import { solveAll } from './solveAll'
import type { MountConfig } from './types'

let nextId = 0
function mk(
  shape: Piece['shape'],
  quality: Piece['quality'],
  stat: Piece['stat'],
): Piece {
  return { id: `p${++nextId}`, shape, quality, stat }
}

const equippedScooter: MountConfig = {
  mountKey: 'electricScooter',
  mountLevel: 0,
  isEquipped: true,
}
const equippedDoomsteed: MountConfig = {
  mountKey: 'doomsteed',
  mountLevel: 0,
  isEquipped: true,
}

describe('solveAll', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([1, 25])('retains empty boards after allocating all %i pieces', async (pieceCount) => {
    const inventory = Array.from({ length: pieceCount }, () => mk('I', 'legend', 'skillDamage'))
    const configs: MountConfig[] = [
      { mountKey: 'netherflameStalker', mountLevel: 3, isEquipped: true },
      { mountKey: 'doomsteed', mountLevel: 1, isEquipped: false },
      { mountKey: 'techHoverboard', mountLevel: 7, isEquipped: false },
      { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: false },
      { mountKey: 'electricScooter', mountLevel: 5, isEquipped: false },
    ]
    const result = await solveAll(inventory, zeroStats(), configs)

    expect(result.boards.map((board) => board.mountKey)).toEqual([
      'netherflameStalker', 'techHoverboard', 'doomsteed', 'ruinWarskitter', 'electricScooter',
    ])
    expect(result.boards.map((board) => board.placements.length)).toEqual(
      pieceCount === 1 ? [1, 0, 0, 0, 0] : [24, 1, 0, 0, 0],
    )
    expect(result.unusedPieceIds).toEqual([])
    expect(result.truncated).toBe(false)
    for (const board of result.boards.filter((board) => board.placements.length === 0)) {
      const config = configs.find((config) => config.mountKey === board.mountKey)!
      expect(board).toMatchObject({
        ...config,
        syncRate: syncRateFor(config.mountKey, config.mountLevel),
        linesFilled: 0,
        buffsFromPieces: zeroStats(),
        buffsFromLines: zeroStats(),
        truncated: false,
        stopReason: 'completed',
      })
    }
    // Empty synced boards add nothing, including Ruin's equipped-only base effect.
    const expected = zeroStats()
    expected.skillDamage = pieceCount === 1 ? 42 : 24 * 42 + 200 + 42 * 0.82
    if (pieceCount > 1) {
      expected.toChilled = 100
      expected.toBosses = 10
    }
    expect(result.afterScore).toBeCloseTo(formula(expected), 8)
  })

  it('keeps equal-grade elemental allocation independent of inventory order', async () => {
    const skill = Array.from({ length: 20 }, () => mk('I', 'legend', 'skillDamage'))
    const chilled = Array.from({ length: 12 }, () => mk('I', 'legend', 'toChilled'))
    const poisoned = Array.from({ length: 4 }, () => mk('I', 'legend', 'toPoisoned'))
    const inventory = [...skill, ...poisoned, ...chilled]
    for (const order of [inventory, [...skill, ...chilled, ...poisoned]]) {
      const result = await solveAll(order, zeroStats(), [
        equippedScooter,
        { mountKey: 'doomsteed', mountLevel: 0, isEquipped: false },
      ])
      const byId = new Map(inventory.map((p) => [p.id, p]))
      const equippedPieces = result.boards[0].placements.map((p) => byId.get(p.pieceId)!)
      expect(equippedPieces.filter((p) => p.stat === 'toChilled')).toHaveLength(9)
      expect(equippedPieces.filter((p) => p.stat === 'toPoisoned')).toHaveLength(0)
    }
  })

  it('keeps the original elemental preference when earlier boards change the leading stat', async () => {
    const realSolve = solveModule.solve
    const startingStats = { ...zeroStats(), toPoisoned: 100, toChilled: 90 }
    const calls: { chilled: number; poisoned: number; priority: readonly string[] | undefined }[] = []
    vi.spyOn(solveModule, 'solve').mockImplementation((inv, stats, opts) => {
      calls.push({ chilled: stats.toChilled, poisoned: stats.toPoisoned, priority: opts?.debuffPriority })
      return realSolve(inv, stats, opts)
    })
    await solveAll(Array.from({ length: 30 }, () => mk('I', 'legend', 'skillDamage')), startingStats, [
      { mountKey: 'netherflameStalker', mountLevel: 4, isEquipped: true },
      { mountKey: 'doomsteed', mountLevel: 0, isEquipped: false },
    ])
    expect(calls).toHaveLength(2)
    expect(calls[1].chilled).toBeGreaterThan(calls[1].poisoned)
    expect(calls.map((c) => c.priority)).toEqual([
      ['toPoisoned', 'toChilled', 'toWeakened'],
      ['toPoisoned', 'toChilled', 'toWeakened'],
    ])
  })

  it('fills all five boards and applies Ruin sync without line bonuses', async () => {
    const inventory = Array.from({ length: 104 }, () => mk('I', 'legend', 'skillDamage'))
    const result = await solveAll(inventory, zeroStats(), [
      { mountKey: 'netherflameStalker', mountLevel: 4, isEquipped: true },
      { mountKey: 'techHoverboard', mountLevel: 7, isEquipped: false },
      { mountKey: 'doomsteed', mountLevel: 1, isEquipped: false },
      { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: false },
      { mountKey: 'electricScooter', mountLevel: 5, isEquipped: false },
    ])
    expect(result.boards).toHaveLength(5)
    expect(result.boards.flatMap((b) => b.placements)).toHaveLength(104)
    expect(result.unusedPieceIds).toEqual([])
    const ruin = result.boards.find((b) => b.mountKey === 'ruinWarskitter')!
    expect(ruin.placements).toHaveLength(24)
    expect(ruin.syncRate).toBe(60)
    expect(ruin.buffsFromPieces.skillDamage).toBe(24 * 42)
    expect(ruin.buffsFromLines).toEqual(zeroStats())
  })

  it('includes the known Shield, Chilled and Boss bonuses when Ruinous is equipped', async () => {
    const inventory = Array.from({ length: 24 }, () => mk('I', 'good', 'skillDamage'))
    const result = await solveAll(inventory, zeroStats(), [
      { mountKey: 'ruinWarskitter', mountLevel: 8, isEquipped: true },
    ])
    expect(result.boards[0].linesFilled).toBe(8)
    expect(result.boards[0].syncRate).toBe(100)
    expect(result.boards[0].buffsFromLines).toEqual({ ...zeroStats(), shieldDamage: 140, toChilled: 100, toBosses: 40, vulnerability: 230 })
    expect(result.afterScore).toBeCloseTo(75.3984, 10)
  })

  it('carries existing and equipped Vulnerability into subsequent synced boards', async () => {
    const realSolve = solveModule.solve
    const seen: (number | undefined)[] = []
    vi.spyOn(solveModule, 'solve').mockImplementation((inventory, stats, opts) => {
      seen.push(stats.vulnerability)
      return realSolve(inventory, stats, opts)
    })
    const result = await solveAll(
      Array.from({ length: 30 }, () => mk('I', 'good', 'skillDamage')),
      { ...zeroStats(), vulnerability: 90 },
      [
        { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: true },
        { mountKey: 'electricScooter', mountLevel: 8, isEquipped: false },
      ],
    )
    expect(seen).toEqual([90, 220])
    expect(result.beforeScore).toBeCloseTo(1.9, 10)
    expect(result.afterScore).toBeCloseTo(24.9872, 10)
    expect(result.boards[1].buffsFromLines.vulnerability).toBe(0)
  })

  it('does not grant Ruinous base or line Vulnerability when it is synced', async () => {
    const result = await solveAll(
      Array.from({ length: 30 }, () => mk('I', 'good', 'skillDamage')),
      { ...zeroStats(), vulnerability: 90 },
      [
        { mountKey: 'netherflameStalker', mountLevel: 0, isEquipped: true },
        { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: false },
      ],
    )
    expect(result.boards[1].buffsFromLines).toEqual(zeroStats())
    expect(result.afterScore).toBeCloseTo(19.8968, 10)
  })

  it('keeps pieces on the equipped board when moving would lose a stronger line bonus', async () => {
    const inventory = Array.from({ length: 6 }, () => mk('O', 'good', 'skillDamage'))
    const result = await solveAll(inventory, zeroStats(), [
      { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: true },
      { mountKey: 'doomsteed', mountLevel: 8, isEquipped: false },
    ])
    expect(result.boards[0].linesFilled).toBe(2)
    expect(result.boards[0].placements).toHaveLength(6)
    expect(result.boards[1].placements).toHaveLength(0)
    expect(result.afterScore).toBeCloseTo(1.6 * 1.1 * 1.4 * 1.3, 10)
  })

  it('matches single-mount solve when only the equipped mount is provided', async () => {
    const inventory: Piece[] = [
      mk('O', 'legend', 'critDamage'),
      mk('I', 'legend', 'skillDamage'),
      mk('T', 'epic', 'shieldDamage'),
    ]
    const result = await solveAll(inventory, zeroStats(), [equippedScooter])
    expect(result.boards.length).toBe(1)
    expect(result.boards[0].mountKey).toBe('electricScooter')
    expect(result.boards[0].isEquipped).toBe(true)
    expect(result.boards[0].syncRate).toBe(100)
    expect(result.unusedPieceIds).toEqual([])
    expect(result.afterScore).toBeGreaterThan(result.beforeScore)
  })

  it('places leftover pieces on the non-equipped board', async () => {
    // 21 small pieces — way more than the 7-wide scooter board can hold.
    // Most should land on the scooter, the rest on the hoverboard.
    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) {
      inventory.push(mk('O', 'legend', 'critDamage'))
    }
    const result = await solveAll(
      inventory,
      zeroStats(),
      [
        equippedScooter,
        { mountKey: 'techHoverboard', mountLevel: 0, isEquipped: false },
      ],
    )
    expect(result.boards.length).toBe(2)
    expect(result.boards[0].isEquipped).toBe(true)
    expect(result.boards[1].isEquipped).toBe(false)
    expect(result.boards[1].mountKey).toBe('techHoverboard')

    const placedAcrossBoards =
      result.boards[0].placements.length + result.boards[1].placements.length
    expect(placedAcrossBoards + result.unusedPieceIds.length).toBe(
      inventory.length,
    )
    expect(result.boards[1].placements.length).toBeGreaterThan(0)
    expect(result.boards[1].buffsFromLines).toEqual(zeroStats())
  })

  it('orders non-equipped boards by descending sync rate', async () => {
    // Equipped scooter comes first, followed by Doomsteed (60%) and Hoverboard (45%).
    const inventory: Piece[] = []
    for (let i = 0; i < 60; i++) inventory.push(mk('O', 'legend', 'critDamage'))
    const result = await solveAll(
      inventory,
      zeroStats(),
      [
        equippedScooter,
        { mountKey: 'techHoverboard', mountLevel: 0, isEquipped: false },
        { mountKey: 'doomsteed', mountLevel: 0, isEquipped: false },
      ],
    )
    expect(result.boards.length).toBe(3)
    expect(result.boards[0].mountKey).toBe('electricScooter')
    expect(result.boards[1].mountKey).toBe('doomsteed')
    expect(result.boards[2].mountKey).toBe('techHoverboard')
  })

  it('non-equipped board piece buffs are unscaled in BoardResult.buffsFromPieces', async () => {
    // Use a small inventory that fits on both boards combined and force the
    // first piece to land on the equipped doomsteed (12-wide). The leftover
    // ends up on the scooter at 30% sync. BoardResult.buffsFromPieces is the
    // FULL value; the "scaled" view is reconstructed at display time.
    const inventory: Piece[] = []
    for (let i = 0; i < 50; i++) inventory.push(mk('O', 'legend', 'critDamage'))
    const result = await solveAll(
      inventory,
      zeroStats(),
      [
        equippedDoomsteed,
        { mountKey: 'electricScooter', mountLevel: 0, isEquipped: false },
      ],
    )
    const ne = result.boards.find((b) => !b.isEquipped)!
    expect(ne.placements.length).toBeGreaterThan(0)
    // BUFF_TABLE.legend.critDamage === 33. Full unscaled sum.
    expect(ne.buffsFromPieces.critDamage).toBe(33 * ne.placements.length)
  })

  it('aggregate afterScore reflects sync-scaled non-equipped contributions', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) inventory.push(mk('O', 'legend', 'critDamage'))

    const result = await solveAll(
      inventory,
      zeroStats(),
      [
        equippedScooter,
        { mountKey: 'techHoverboard', mountLevel: 0, isEquipped: false },
      ],
    )
    const eq = result.boards.find((b) => b.isEquipped)!
    const ne = result.boards.find((b) => !b.isEquipped)!

    const expectedStats = zeroStats()
    expectedStats.critDamage =
      eq.buffsFromPieces.critDamage +
      eq.buffsFromLines.critDamage +
      ne.buffsFromPieces.critDamage * (ne.syncRate / 100)
    // No other stats should be touched (all pieces buff critDamage).
    expect(result.afterScore).toBeCloseTo(formula(expectedStats), 8)
  })

  it('sync rate is taken from the mount level', async () => {
    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) inventory.push(mk('O', 'legend', 'critDamage'))

    const result = await solveAll(inventory, zeroStats(), [
      equippedScooter,
      { mountKey: 'doomsteed', mountLevel: 4, isEquipped: false },
    ])
    const ne = result.boards.find((b) => b.mountKey === 'doomsteed')!
    expect(ne.syncRate).toBe(syncRateFor('doomsteed', 4))
  })

  it('forwards timeBudgetMs to each board solve unchanged (per-board, not shared)', async () => {
    // Spy on `solve` to capture the `timeBudgetMs` passed to each board.
    // Under the old shared-deadline behavior, board 2 would be called with
    // ~0 (or skipped entirely once the shared deadline expired). Under the
    // new per-board behavior, every board sees the full budget.
    const realSolve = solveModule.solve
    const calls: { mountKey: string; timeBudgetMs: number | undefined }[] = []
    vi.spyOn(solveModule, 'solve').mockImplementation((inv, stats, opts) => {
      calls.push({
        mountKey: opts?.mountKey ?? '?',
        timeBudgetMs: opts?.timeBudgetMs,
      })
      return realSolve(inv, stats, opts)
    })

    const inventory: Piece[] = []
    for (let i = 0; i < 24; i++) inventory.push(mk('O', 'legend', 'critDamage'))

    await solveAll(
      inventory,
      zeroStats(),
      [
        equippedScooter,
        { mountKey: 'techHoverboard', mountLevel: 0, isEquipped: false },
      ],
      { timeBudgetMs: 42 },
    )

    expect(calls.length).toBe(2)
    expect(calls[0].mountKey).toBe('electricScooter')
    expect(calls[0].timeBudgetMs).toBe(42)
    expect(calls[1].mountKey).toBe('techHoverboard')
    expect(calls[1].timeBudgetMs).toBe(42)
  })

  it('throws if no equipped mount is provided', async () => {
    await expect(
      solveAll([mk('O', 'good', 'critDamage')], zeroStats(), [
        { mountKey: 'electricScooter', mountLevel: 0, isEquipped: false },
      ]),
    ).rejects.toThrow(/isEquipped/)
  })
})
