import { describe, expect, it } from 'vitest'
import { BUFF_TABLE } from '../data/buffTable'
import { MOUNTS } from '../data/mounts'
import { zeroStats } from '../data/stats'
import type { Piece } from '../data/types'
import { applyLineBonuses, formula, scoreLayout } from './scoring'

const ES_TIERS = MOUNTS.electricScooter.lineBonusTiers
const TH_TIERS = MOUNTS.techHoverboard.lineBonusTiers
const DS_TIERS = MOUNTS.doomsteed.lineBonusTiers

describe('formula', () => {
  it('returns 1 for all-zero stats', () => {
    expect(formula(zeroStats())).toBe(1)
  })

  it('groups debuff-conditional stats additively', () => {
    const s = zeroStats()
    s.toWeakened = 10
    s.toPoisoned = 10
    s.toChilled = 10
    expect(formula(s)).toBeCloseTo(1.3, 10)
  })

  it('multiplies non-conditional stats separately', () => {
    const s = zeroStats()
    s.critDamage = 20
    s.skillDamage = 10
    expect(formula(s)).toBeCloseTo(1.32, 10)
  })

  it('matches a hand-computed multi-stat example', () => {
    const s = zeroStats()
    s.critDamage = 50
    s.skillDamage = 30
    s.shieldDamage = 20
    s.laceration = 10
    s.toBosses = 5
    s.toWeakened = 20
    s.toPoisoned = 10
    s.toChilled = 0
    const expected = 1.5 * 1.3 * 1.2 * 1.1 * 1.05 * 1.3
    expect(formula(s)).toBeCloseTo(expected, 10)
  })
})

describe('applyLineBonuses (Electric Scooter)', () => {
  it('does nothing at L=0', () => {
    const s = zeroStats()
    applyLineBonuses(s, 0, ES_TIERS, 0)
    expect(s).toEqual(zeroStats())
  })
  it('L=1 adds +10 toWeakened', () => {
    const s = zeroStats()
    applyLineBonuses(s, 1, ES_TIERS, 0)
    expect(s.toWeakened).toBe(10)
    expect(s.critDamage).toBe(0)
  })
  it('L=2 behaves the same as L=1', () => {
    const s = zeroStats()
    applyLineBonuses(s, 2, ES_TIERS, 0)
    expect(s.toWeakened).toBe(10)
    expect(s.critDamage).toBe(0)
  })
  it('L=3 adds +15 toWeakened and +20 critDamage cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 3, ES_TIERS, 0)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(20)
  })
  it('L=4 adds +35 critDamage cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 4, ES_TIERS, 0)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
  })
  it('mount level 0 caps at L=4', () => {
    const s = zeroStats()
    applyLineBonuses(s, 8, ES_TIERS, 0)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
    expect(s.laceration).toBe(0)
  })
  it('mount level 2 unlocks the 5-line bonus (+10 laceration)', () => {
    const s = zeroStats()
    applyLineBonuses(s, 5, ES_TIERS, 2)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
    expect(s.laceration).toBe(10)
  })
  it('mount level 1 still locks the 5-line bonus', () => {
    const s = zeroStats()
    applyLineBonuses(s, 5, ES_TIERS, 1)
    expect(s.laceration).toBe(0)
  })
  it('L=6 with mount level 4 adds +20 toWeakened and +55 critDamage cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 6, ES_TIERS, 4)
    expect(s.toWeakened).toBe(45)
    expect(s.critDamage).toBe(110)
    expect(s.laceration).toBe(10)
  })
  it('L=6 with mount level 3 still locks the 6-line tier', () => {
    const s = zeroStats()
    applyLineBonuses(s, 6, ES_TIERS, 3)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
    expect(s.laceration).toBe(10)
  })
  it('L=7 with mount level 6 adds +35 toWeakened and +90 critDamage cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 7, ES_TIERS, 6)
    expect(s.toWeakened).toBe(80)
    expect(s.critDamage).toBe(200)
    expect(s.laceration).toBe(10)
  })
  it('L=8 with mount level 8 adds the final +20 laceration cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 8, ES_TIERS, 8)
    expect(s.toWeakened).toBe(80)
    expect(s.critDamage).toBe(200)
    expect(s.laceration).toBe(30)
  })
  it('L=8 with mount level 7 locks the 8-line tier', () => {
    const s = zeroStats()
    applyLineBonuses(s, 8, ES_TIERS, 7)
    expect(s.toWeakened).toBe(80)
    expect(s.critDamage).toBe(200)
    expect(s.laceration).toBe(10)
  })
})

describe('applyLineBonuses (Tech Hoverboard)', () => {
  it('L=1 adds +15 toChilled and +10 skillDamage', () => {
    const s = zeroStats()
    applyLineBonuses(s, 1, TH_TIERS, 0)
    expect(s.toChilled).toBe(15)
    expect(s.skillDamage).toBe(10)
  })
  it('L=4 adds +40 shieldDamage cumulatively (chilled +40, skill +25)', () => {
    const s = zeroStats()
    applyLineBonuses(s, 4, TH_TIERS, 0)
    expect(s.toChilled).toBe(40)
    expect(s.skillDamage).toBe(25)
    expect(s.shieldDamage).toBe(40)
  })
  it('L=8 with level 8 stacks the 8-line shieldDamage on top', () => {
    const s = zeroStats()
    applyLineBonuses(s, 8, TH_TIERS, 8)
    expect(s.shieldDamage).toBe(100)
    expect(s.toChilled).toBe(200)
    expect(s.skillDamage).toBe(100)
  })
  it('L=5 with level 1 still locks the 5-line tier', () => {
    const s = zeroStats()
    applyLineBonuses(s, 5, TH_TIERS, 1)
    expect(s.toChilled).toBe(40)
  })
})

describe('applyLineBonuses (Doomsteed)', () => {
  it('L=4 adds +150 skillDamage on top of the 3-line bonus', () => {
    const s = zeroStats()
    applyLineBonuses(s, 4, DS_TIERS, 0)
    expect(s.toPoisoned).toBe(60)
    expect(s.skillDamage).toBe(200)
  })
  it('has no 5-line tier (L=5 same as L=4)', () => {
    const a = zeroStats()
    applyLineBonuses(a, 4, DS_TIERS, 8)
    const b = zeroStats()
    applyLineBonuses(b, 5, DS_TIERS, 8)
    expect(a).toEqual(b)
  })
  it('L=8 dynamic toBosses scales with toPoisoned (no pre-existing toPoisoned)', () => {
    // Doomsteed line bonuses contribute toPoisoned = 20 + 40 + 60 + 80 = 200.
    // floor(200 / 160) = 1 → +5 toBosses from the dynamic tier.
    // Plus the 7-line static toBosses = +5. Total toBosses = +10.
    const s = zeroStats()
    applyLineBonuses(s, 8, DS_TIERS, 8)
    expect(s.toPoisoned).toBe(200)
    expect(s.toBosses).toBe(10)
  })
  it('L=8 dynamic toBosses caps at +25 (with high pre-existing toPoisoned)', () => {
    // 200 (line bonuses) + 800 (pre-mount) = 1000. floor(1000/160) = 6.
    // 6 * 5 = 30, capped at 25. Plus +5 from the 7-line static. Total = 30.
    const s = zeroStats()
    s.toPoisoned = 800
    applyLineBonuses(s, 8, DS_TIERS, 8)
    expect(s.toBosses).toBe(30)
  })
  it('L=8 dynamic toBosses adds nothing when toPoisoned < 160 after line bonuses', () => {
    // Doomsteed up through L=8 always pushes toPoisoned to 200, so the only
    // way to land below 160 here is to *test the compute formula directly*
    // — applied with a tier list containing only the compute tier.
    const onlyCompute = DS_TIERS.filter((t) => t.compute)
    const s = zeroStats()
    s.toPoisoned = 100
    applyLineBonuses(s, 8, onlyCompute, 8)
    expect(s.toBosses).toBe(0)
  })
})

describe('scoreLayout', () => {
  it('combines piece buffs with line bonuses', () => {
    const piece: Piece = {
      id: 'p1',
      shape: 'O',
      quality: 'good',
      stat: 'critDamage',
    }
    const current = zeroStats()
    const buff = BUFF_TABLE.good.critDamage
    const score = scoreLayout(current, [piece], 0, ES_TIERS, 0)
    expect(score).toBeCloseTo(1 + buff / 100, 10)
  })
})
