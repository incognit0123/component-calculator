import { describe, expect, it } from 'vitest'
import { syncRateFor } from '../data/mounts'
import { zeroStats } from '../data/stats'
import type { Piece } from '../data/types'
import { formula } from './scoring'
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
      { mode: 'normal' },
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
    // Equip scooter at 0★ (20%); hoverboard at 0★ (30%); doomsteed at 0★ (40%).
    // Non-equipped order should be: doomsteed (40%), then hoverboard (30%).
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
      { mode: 'normal' },
    )
    expect(result.boards.length).toBe(3)
    expect(result.boards[0].mountKey).toBe('electricScooter')
    expect(result.boards[1].mountKey).toBe('doomsteed')
    expect(result.boards[2].mountKey).toBe('techHoverboard')
  })

  it('non-equipped board piece buffs are unscaled in BoardResult.buffsFromPieces', async () => {
    // Use a small inventory that fits on both boards combined and force the
    // first piece to land on the equipped doomsteed (12-wide). The leftover
    // ends up on the scooter at 20% sync. BoardResult.buffsFromPieces is the
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
      { mode: 'normal' },
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
      { mode: 'normal' },
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

  it('throws if no equipped mount is provided', async () => {
    await expect(
      solveAll([mk('O', 'good', 'critDamage')], zeroStats(), [
        { mountKey: 'electricScooter', mountLevel: 0, isEquipped: false },
      ]),
    ).rejects.toThrow(/isEquipped/)
  })
})
