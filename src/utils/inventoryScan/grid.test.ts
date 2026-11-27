import { describe, expect, it } from 'vitest'
import { loadFixture } from './fixtures'
import { detectGrid } from './grid'
import { resize } from './image'

const FULL_CELLS: Record<string, number> = {
  'all-by-quality-full': 16,
  'all-by-shape': 16,
  weakened: 6,
  chilled: 13,
  poisoned: 9,
  shield: 11,
  bosses: 11,
  'laceration-top': 16,
  'laceration-middle': 16,
  'laceration-bottom': 14,
  'skill-top': 16,
  'skill-scrolled': 16,
  'panel-open': 13,
}

describe('detectGrid', () => {
  it.each(Object.entries(FULL_CELLS))('finds the 4-column grid in %s', (name, count) => {
    const g = detectGrid(loadFixture(name))
    expect(g).not.toBeNull()
    expect(g!.columns).toHaveLength(4)
    expect(g!.cellSize).toBeCloseTo(238, -1)
    expect(g!.pitchY).toBeCloseTo(266, -1)
    expect(g!.cells).toHaveLength(count)
  })

  it('returns null for an empty list and for a frame dimmed by a stat popup', () => {
    expect(detectGrid(loadFixture('crit-empty'))).toBeNull()
    expect(detectGrid(loadFixture('popup-dimmed'))).toBeNull()
  })

  it('leaves trailing empty slots out of the last row', () => {
    const g = detectGrid(loadFixture('laceration-bottom'))!
    const last = g.cells.filter((c) => c.row === g.rowTops.length - 1)
    expect(last.map((c) => c.col)).toEqual([0, 1])
  })

  it.each([0.6, 0.885, 1.18])('is resolution independent (scale %s)', (scale) => {
    const src = loadFixture('chilled')
    const g = detectGrid(resize(src, Math.round(src.width * scale), Math.round(src.height * scale)))
    expect(g).not.toBeNull()
    expect(g!.columns).toHaveLength(4)
    expect(g!.cellSize / scale).toBeCloseTo(238, -1)
    expect(g!.cells).toHaveLength(13)
  })
})
