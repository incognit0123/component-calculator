import { describe, expect, it } from 'vitest'
import labels from './__fixtures__/labels.json'
import { loadFixture } from './fixtures'
import { syntheticList } from './synthScroll'
import { InventoryScanner } from './track'
import type { ScanSegment } from './track'

const ROWS = [
  ...[0, 1, 2, 3].map((row) => ({ fixture: 'skill-top', row })),
  ...[0, 1, 2, 3].map((row) => ({ fixture: 'laceration-middle', row })),
  { fixture: 'laceration-bottom', row: 3 },
]

function listed(seg: ScanSegment): string[] {
  return seg.pieces.map((p) => `${p.shape} ${p.quality}`)
}

function scan(frames: Iterable<Parameters<InventoryScanner['addFrame']>[0]>): ScanSegment[] {
  const s = new InventoryScanner()
  for (const f of frames) s.addFrame(f)
  return s.result()
}

function* scrollFrames(list: ReturnType<typeof syntheticList>, offsets: number[]) {
  for (const o of offsets) yield list.frameAt(Math.min(o, list.maxScroll))
}

function steps(to: number, step: number): number[] {
  const out: number[] = []
  for (let o = 0; o < to + step; o += step) out.push(Math.min(o, to))
  return out
}

describe('InventoryScanner', () => {
  const list = syntheticList('skill-top', ROWS)

  it('counts every cell once over a slow scroll', () => {
    const [seg] = scan(scrollFrames(list, steps(list.maxScroll, 37)))
    expect(seg.filter).toBe('skillDamage')
    expect(listed(seg)).toEqual(list.expected)
    expect(seg.ambiguousSteps).toBe(0)
    expect(list.expected).toHaveLength(34)
  })

  it('tracks a scroll that goes down, back up and down again', () => {
    const down = steps(list.maxScroll, 61)
    const offsets = [...down.slice(0, 8), ...down.slice(2, 8).reverse(), ...down.slice(2)]
    expect(listed(scan(scrollFrames(list, offsets))[0])).toEqual(list.expected)
  })

  it('never miscounts silently when frames jump more than half a row', () => {
    const [seg] = scan(scrollFrames(list, steps(list.maxScroll, 190)))
    if (seg.ambiguousSteps === 0) expect(listed(seg)).toEqual(list.expected)
  })

  it('recovers flings over distinct rows from the cells already seen', () => {
    for (const step of [190, 350]) {
      const [seg] = scan(scrollFrames(list, steps(list.maxScroll, step)))
      expect(listed(seg)).toEqual(list.expected)
      expect(seg.ambiguousSteps).toBe(0)
    }
  })

  it('counts a run of identical rows once over a slow scroll', () => {
    const identical = syntheticList('skill-top', [
      { fixture: 'skill-top', row: 0 },
      { fixture: 'skill-top', row: 1 },
      ...Array.from({ length: 6 }, () => ({ fixture: 'skill-top', row: 2 })),
      ...[0, 1, 2, 3].map((row) => ({ fixture: 'laceration-middle', row })),
    ])
    expect(identical.expected).toHaveLength(48)
    for (const step of [20, 37, 61]) {
      const [seg] = scan(scrollFrames(identical, steps(identical.maxScroll, step)))
      expect(listed(seg)).toEqual(identical.expected)
      expect(seg.ambiguousSteps).toBe(0)
    }
  })

  it('skips frames dimmed by a stat popup', () => {
    const offsets = steps(list.maxScroll, 45)
    const frames = offsets.map((o) => list.frameAt(o))
    frames.splice(6, 0, loadFixture('popup-dimmed'), loadFixture('popup-dimmed'))
    expect(listed(scan(frames)[0])).toEqual(list.expected)
  })

  it('starts a segment per filter', () => {
    const chilled = loadFixture('chilled')
    const segs = scan([chilled, chilled, chilled, ...scrollFrames(list, steps(list.maxScroll, 50))])
    expect(segs.map((s) => s.filter)).toEqual(['toChilled', 'skillDamage'])
    expect(segs[0].pieces).toHaveLength(13)
    expect(listed(segs[1])).toEqual(list.expected)
  })

  it('starts a segment for a filter shown in a single frame', () => {
    const frames = steps(list.maxScroll, 50).map((o) => list.frameAt(o))
    frames.splice(5, 0, loadFixture('weakened'))
    const segs = scan(frames)
    expect(segs.map((s) => s.filter)).toEqual(['skillDamage', 'toWeakened', 'skillDamage'])
    expect(segs[1].pieces).toHaveLength(6)
  })

  it('measures every frame afresh after Install Component zooms open', () => {
    const frames = ['open-zoom-1', 'open-zoom-2', 'open-zoom-3', 'open-settled', 'weakened'].map(loadFixture)
    const [all, weakened] = scan(frames)
    const expected = (name: string) =>
      (labels as Record<string, string[]>)[name].map((c) => c.split(' ').slice(1).join(' '))
    expect(listed(all)).toEqual(expected('all-by-quality-full'))
    expect(listed(weakened)).toEqual(expected('weakened'))
  })
})
