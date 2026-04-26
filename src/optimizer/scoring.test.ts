import { describe, expect, it } from 'vitest'
import { zeroStats } from '../data/stats'
import { applyLineBonuses, formula, scoreLayout } from './scoring'
import { BUFF_TABLE } from '../data/buffTable'
import type { Piece } from '../data/types'

describe('formula', () => {
  it('returns 1 for all-zero stats', () => {
    expect(formula(zeroStats())).toBe(1)
  })

  it('groups debuff-conditional stats additively', () => {
    const s = zeroStats()
    s.toWeakened = 10
    s.toPoisoned = 10
    s.toChilled = 10
    // (1 + 30/100) = 1.3, all other factors = 1
    expect(formula(s)).toBeCloseTo(1.3, 10)
  })

  it('multiplies non-conditional stats separately', () => {
    const s = zeroStats()
    s.critDamage = 20
    s.skillDamage = 10
    // (1.2) * (1.1) = 1.32
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

describe('applyLineBonuses', () => {
  it('does nothing at L=0', () => {
    const s = zeroStats()
    applyLineBonuses(s, 0)
    expect(s).toEqual(zeroStats())
  })
  it('L=1 adds +10 toWeakened', () => {
    const s = zeroStats()
    applyLineBonuses(s, 1)
    expect(s.toWeakened).toBe(10)
    expect(s.critDamage).toBe(0)
  })
  it('L=2 behaves the same as L=1', () => {
    const s = zeroStats()
    applyLineBonuses(s, 2)
    expect(s.toWeakened).toBe(10)
    expect(s.critDamage).toBe(0)
  })
  it('L=3 adds +15 toWeakened and +20 critDamage cumulatively', () => {
    const s = zeroStats()
    applyLineBonuses(s, 3)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(20)
  })
  it('L=4 adds +35 critDamage cumulatively (total crit +55, weakened +25)', () => {
    const s = zeroStats()
    applyLineBonuses(s, 4)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
  })
  it('L=5+ does not scale further', () => {
    const s = zeroStats()
    applyLineBonuses(s, 8)
    expect(s.toWeakened).toBe(25)
    expect(s.critDamage).toBe(55)
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
    const buff = BUFF_TABLE.good.critDamage // 8
    // no lines filled
    const score = scoreLayout(current, [piece], 0)
    expect(score).toBeCloseTo(1 + buff / 100, 10)
  })
})
