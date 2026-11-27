import { describe, expect, it, vi } from 'vitest'
import { loadFixture } from './fixtures'
import type { RgbaImage } from './image'
import { scanFiles } from './scanFiles'
import { syntheticList } from './synthScroll'

const framesByFile = new Map<string, RgbaImage[]>()

vi.mock('./frames', () => ({
  decodeImage: async (file: File) => framesByFile.get(file.name)![0],
  forEachVideoFrame: async (file: File, onFrame: (f: RgbaImage) => void) => {
    for (const f of framesByFile.get(file.name)!) onFrame(f)
  },
}))

const list = syntheticList('skill-top', [
  ...[0, 1, 2, 3].map((row) => ({ fixture: 'skill-top', row })),
  ...[0, 1, 2, 3].map((row) => ({ fixture: 'laceration-middle', row })),
])
const scroll = (from: number, to: number) => {
  const out: RgbaImage[] = []
  for (let o = from; o <= to; o += 40) out.push(list.frameAt(o))
  return out
}

describe('scanFiles', () => {
  it('flags a filter that continues from one recording into the next', async () => {
    framesByFile.set('a.mp4', scroll(0, list.maxScroll))
    framesByFile.set('b.mp4', scroll(0, list.maxScroll))
    const { segments } = await scanFiles([
      new File([], 'a.mp4', { type: 'video/mp4' }),
      new File([], 'b.mp4', { type: 'video/mp4' }),
    ])
    expect(segments.map((s) => [s.filter, s.spansFiles])).toEqual([['skillDamage', true]])
  })

  it('does not flag a recording followed by a different filter', async () => {
    framesByFile.set('a.mp4', scroll(0, list.maxScroll))
    framesByFile.set('b.mp4', [loadFixture('weakened')])
    const { segments } = await scanFiles([
      new File([], 'a.mp4', { type: 'video/mp4' }),
      new File([], 'b.mp4', { type: 'video/mp4' }),
    ])
    expect(segments.map((s) => [s.filter, s.spansFiles])).toEqual([
      ['skillDamage', false],
      ['toWeakened', false],
    ])
  })

  it('reports files that are neither video nor image', async () => {
    framesByFile.set('a.mp4', scroll(0, list.maxScroll))
    const { segments, skipped } = await scanFiles([
      new File([], 'clip.mkv'),
      new File([], 'a.mp4', { type: 'video/mp4' }),
    ])
    expect(skipped).toEqual(['clip.mkv'])
    expect(segments).toHaveLength(1)
  })
})
