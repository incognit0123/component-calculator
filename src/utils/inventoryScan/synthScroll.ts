import labels from './__fixtures__/labels.json'
import { loadFixture } from './fixtures'
import { detectGrid } from './grid'
import { crop } from './image'
import type { RgbaImage } from './image'

/** The cropped fixtures' list viewport and row pitch, measured from scrolled screenshots. */
const VIEW_TOP = 210
const VIEW_BOTTOM = 1299
const PITCH = 266
const HALF_GUTTER = 14
const TOP_PAD = 11

export interface SyntheticList {
  frameAt(scroll: number): RgbaImage
  maxScroll: number
  /** `shape quality` per cell, in list order. */
  expected: string[]
}

/** Test-only: a list stacked from real fixture rows, shown through `base`'s viewport at any scroll offset. */
export function syntheticList(base: string, rows: { fixture: string; row: number }[]): SyntheticList {
  const baseImg = loadFixture(base)
  const width = baseImg.width
  const contentHeight = TOP_PAD + rows.length * PITCH + (VIEW_BOTTOM - VIEW_TOP)
  const content = new Uint8ClampedArray(width * contentHeight * 4)
  const lavenderAt = ((VIEW_TOP + 2) * width + 90) * 4
  const lavender = baseImg.data.slice(lavenderAt, lavenderAt + 4)
  for (let i = 0; i < content.length; i += 4) content.set(lavender, i)

  const expected: string[] = []
  rows.forEach(({ fixture, row }, i) => {
    const img = loadFixture(fixture)
    const top = detectGrid(img)!.rowTops[row]
    const band = crop(img, { x: 0, y: top - HALF_GUTTER, w: width, h: PITCH })
    content.set(band.data, (TOP_PAD + i * PITCH) * width * 4)
    for (const cell of (labels as Record<string, string[]>)[fixture]) {
      const [pos, shape, quality] = cell.split(' ')
      if (Number(pos.split(',')[0]) === row) expected.push(`${shape} ${quality}`)
    }
  })

  const viewHeight = VIEW_BOTTOM - VIEW_TOP
  return {
    maxScroll: TOP_PAD + rows.length * PITCH - viewHeight + HALF_GUTTER,
    expected,
    frameAt(scroll) {
      const data = new Uint8ClampedArray(baseImg.data)
      const from = Math.max(0, Math.round(scroll)) * width * 4
      data.set(content.subarray(from, from + viewHeight * width * 4), VIEW_TOP * width * 4)
      return { width, height: baseImg.height, data }
    },
  }
}
