import { describe, expect, it } from 'vitest'
import { classifyCell, LOW_CONFIDENCE } from './classify'
import labels from './__fixtures__/labels.json'
import { loadFixture } from './fixtures'
import { detectGrid } from './grid'
import { resize } from './image'
import type { RgbaImage } from './image'

function readAll(img: RgbaImage): string[] {
  const g = detectGrid(img)
  if (!g) return []
  return g.cells.map((c) => {
    const r = classifyCell(img, c.rect)
    return `${c.row},${c.col} ${r?.shape} ${r?.quality}`
  })
}

const LABELLED = Object.entries(labels as Record<string, string[]>)

describe('classifyCell', () => {
  it.each(LABELLED)('reads every cell in %s', (name, expected) => {
    expect(readAll(loadFixture(name))).toEqual(expected)
  })

  it('covers every tier and shape', () => {
    const seen = new Set(LABELLED.flatMap(([, cells]) => cells.flatMap((c) => c.split(' ').slice(1))))
    for (const k of ['good', 'better', 'excellent', 'excellentPlus', 'epic', 'epicPlus', 'legend', 'O', 'I', 'T', 'L', 'J']) {
      expect(seen).toContain(k)
    }
  })

  it('is confident on every labelled cell', () => {
    for (const [name] of LABELLED) {
      const img = loadFixture(name)
      for (const c of detectGrid(img)!.cells) {
        expect(classifyCell(img, c.rect)!.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE)
      }
    }
  })

  it.each([0.6, 0.885])('reads the same at scale %s', (scale) => {
    for (const name of ['laceration-bottom', 'chilled', 'all-by-quality-full']) {
      const src = loadFixture(name)
      const img = resize(src, Math.round(src.width * scale), Math.round(src.height * scale))
      expect(readAll(img)).toEqual((labels as Record<string, string[]>)[name])
    }
  })
})
