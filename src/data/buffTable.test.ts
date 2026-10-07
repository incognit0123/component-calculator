import { describe, expect, it } from 'vitest'
import { BUFF_TABLE } from './buffTable'
import { QUALITIES } from './qualities'
import { STAT_KEYS } from './stats'

describe('BUFF_TABLE', () => {
  // The optimizer's quality-dominance shortcut (greedy.ts takes the best-quality
  // piece first within one shape+stat) is only valid if, for a fixed stat, every
  // higher tier gives strictly more buff. This depends only on the static table
  // — never on a player's stats — because the damage formula only grows with
  // buff. Cross-stat dominance (e.g. a tier's worst stat beating the previous
  // tier's best stat) is deliberately NOT assumed anywhere.
  it('is strictly increasing with quality for every stat', () => {
    for (const stat of STAT_KEYS) {
      for (let i = 1; i < QUALITIES.length; i++) {
        const lower = BUFF_TABLE[QUALITIES[i - 1].key][stat]
        const higher = BUFF_TABLE[QUALITIES[i].key][stat]
        expect(
          higher,
          `${stat}: ${QUALITIES[i].key} should beat ${QUALITIES[i - 1].key}`,
        ).toBeGreaterThan(lower)
      }
    }
  })
})
