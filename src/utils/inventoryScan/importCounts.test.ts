import { describe, expect, it } from 'vitest'
import type { Piece } from '../../data/types'
import { defaultStat, planImport } from './importCounts'
import type { ScanSegment } from './track'

const seg = (filter: ScanSegment['filter'], pieces: Partial<ScanSegment['pieces'][number]>[]): ScanSegment => ({
  filter,
  filterConfidence: 1,
  frames: 10,
  ambiguousSteps: 0,
  pieces: pieces.map((p, i) => ({ row: 0, col: i, shape: 'I', quality: 'epic', confidence: 1, ...p })),
})

const owned: Piece[] = [
  { id: 'a', shape: 'O', quality: 'good', stat: 'critDamage' },
  { id: 'b', shape: 'T', quality: 'legend', stat: 'laceration' },
]

describe('planImport', () => {
  it('replaces recorded stats and keeps the rest of the inventory', () => {
    const plan = planImport([{ segment: seg('laceration', [{}, { shape: 'L' }]), stat: 'laceration' }], owned)
    expect(plan.importedStats).toEqual(['laceration'])
    expect(plan.pieces).toEqual([
      { shape: 'O', quality: 'good', stat: 'critDamage' },
      { shape: 'I', quality: 'epic', stat: 'laceration' },
      { shape: 'L', quality: 'epic', stat: 'laceration' },
    ])
  })

  it('imports an empty filter as zero pieces of that stat', () => {
    const plan = planImport([{ segment: seg('critDamage', []), stat: 'critDamage' }], owned)
    expect(plan.pieces.filter((p) => p.stat === 'critDamage')).toEqual([])
    expect(plan.cleared).toEqual([{ stat: 'critDamage', removed: 1 }])
    expect(planImport([{ segment: seg('toBosses', []), stat: 'toBosses' }], owned).cleared).toEqual([])
  })

  it('counts unreadable cells instead of guessing them', () => {
    const plan = planImport([{ segment: seg('toChilled', [{}, { shape: null }]), stat: 'toChilled' }], [])
    expect(plan.pieces).toHaveLength(1)
    expect(plan.unreadable).toBe(1)
  })

  it('keeps the fuller of two segments chosen for the same stat', () => {
    const plan = planImport(
      [
        { segment: seg('skillDamage', [{}]), stat: 'skillDamage' },
        { segment: seg('skillDamage', [{}, {}, {}]), stat: 'skillDamage' },
        { segment: seg('skillDamage', [{}, {}]), stat: 'skillDamage' },
      ],
      [],
    )
    expect(plan.duplicates).toEqual(['skillDamage'])
    expect(plan.pieces).toHaveLength(3)
  })

  it('skips segments without a stat and defaults ALL segments to skipped', () => {
    const all = seg('all', [{}])
    expect(defaultStat(all)).toBeNull()
    expect(planImport([{ segment: all, stat: null }], owned).pieces).toHaveLength(2)
  })
})
