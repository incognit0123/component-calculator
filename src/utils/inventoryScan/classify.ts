import { SHAPE_KEYS, SHAPE_ROTATIONS } from '../../data/shapes'
import type { QualityTier, ShapeKey } from '../../data/types'
import type { RgbaImage, Rect } from './image'

export interface CellReading {
  shape: ShapeKey | null
  quality: QualityTier | null
  /** 0–1; below `LOW_CONFIDENCE` the UI asks the user to check the cell. */
  confidence: number
}

export const LOW_CONFIDENCE = 0.6

type Family = 'green' | 'blue' | 'purple' | 'orange' | 'red'

/** Median hue of each tier colour's fill, measured on the fixtures; the game's palette differs from `QUALITIES`. */
const FAMILY_HUES: { family: Family; hue: number }[] = [
  { family: 'green', hue: 105 },
  { family: 'blue', hue: 218 },
  { family: 'purple', hue: 268 },
  { family: 'orange', hue: 28 },
  { family: 'red', hue: 344 },
]

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Bounding-box aspect → (cols, rows) in piece units. */
function unitDims(aspect: number): [number, number] {
  if (aspect < 0.4) return [1, 4]
  if (aspect > 2.5) return [4, 1]
  if (aspect < 0.8) return [2, 3]
  if (aspect > 1.25) return [3, 2]
  return [2, 2]
}

function matchShape(occupied: [number, number][]): ShapeKey | null {
  const key = occupied
    .map(([r, c]) => `${r},${c}`)
    .sort()
    .join('|')
  for (const shape of SHAPE_KEYS) {
    for (const rot of SHAPE_ROTATIONS[shape]) {
      const k = rot
        .map(([r, c]) => `${r},${c}`)
        .sort()
        .join('|')
      if (k === key) return shape
    }
  }
  return null
}

export function classifyCell(img: RgbaImage, rect: Rect): CellReading | null {
  const { width, data } = img
  const x0 = Math.round(rect.x + rect.w * 0.05)
  const x1 = Math.round(rect.x + rect.w * 0.95)
  const y0 = Math.round(rect.y + rect.h * 0.05)
  const y1 = Math.round(rect.y + rect.h * 0.95)
  const mw = x1 - x0
  const mh = y1 - y0
  const mask = new Uint8Array(mw * mh)
  const value = new Uint8Array(mw * mh)
  const hues: number[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < mh; y += 1) {
    for (let x = 0; x < mw; x += 1) {
      const i = ((y0 + y) * width + x0 + x) * 4
      const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2])
      if (s <= 0.45 || v <= 110) continue
      const m = y * mw + x
      mask[m] = 1
      value[m] = v
      hues.push(h)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (hues.length < mw * mh * 0.02) return null

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const [cols, rows] = unitDims(bw / bh)
  const uw = bw / cols
  const uh = bh / rows

  const occupied: [number, number][] = []
  const centres: { x: number; y: number }[] = []
  let occupancyMargin = 1
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let on = 0
      let total = 0
      for (let y = Math.round(minY + r * uh); y < Math.round(minY + (r + 1) * uh); y += 1) {
        for (let x = Math.round(minX + c * uw); x < Math.round(minX + (c + 1) * uw); x += 1) {
          on += mask[y * mw + x]
          total += 1
        }
      }
      const frac = on / Math.max(1, total)
      occupancyMargin = Math.min(occupancyMargin, Math.abs(frac - 0.5) * 2)
      if (frac > 0.5) {
        occupied.push([r, c])
        centres.push({ x: minX + (c + 0.5) * uw, y: minY + (r + 0.5) * uh })
      }
    }
  }
  const shape = occupied.length === 4 ? matchShape(occupied) : null

  const sortedHues = [...hues].sort((a, b) => a - b)
  const medianHue = sortedHues[sortedHues.length >> 1]
  const ranked = FAMILY_HUES.map((f) => ({ ...f, d: hueDistance(f.hue, medianHue) })).sort((a, b) => a.d - b.d)
  const family = ranked[0].family
  const hueMargin = Math.min(1, (ranked[1].d - ranked[0].d) / 40)

  const fill = quantileOf(value, mask, 0.25)
  let diamonds = 0
  const radius = Math.max(1, Math.round(Math.min(uw, uh) * 0.08))
  for (const { x, y } of centres) {
    let sum = 0
    let n = 0
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const m = Math.round(y + dy) * mw + Math.round(x + dx)
        if (!mask[m]) continue
        sum += value[m]
        n += 1
      }
    }
    if (n > 0 && sum / n > fill + 10) diamonds += 1
  }
  const diamondShare = centres.length > 0 ? diamonds / centres.length : 0
  const plus = diamondShare >= 0.5

  const quality = toQuality(family, plus)
  const confidence = Math.min(shape ? occupancyMargin : 0, hueMargin, Math.abs(diamondShare - 0.5) * 2)
  return { shape, quality, confidence }
}

/** Light borders and diamonds can cover over half of a +1 piece, so its plain fill colour is a low quantile, not the median. */
function quantileOf(values: Uint8Array, mask: Uint8Array, q: number): number {
  const hist = new Uint32Array(256)
  let n = 0
  for (let i = 0; i < values.length; i += 1) {
    if (!mask[i]) continue
    hist[values[i]] += 1
    n += 1
  }
  let acc = 0
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v]
    if (acc >= n * q) return v
  }
  return 255
}

function toQuality(family: Family, plus: boolean): QualityTier {
  switch (family) {
    case 'green':
      return 'good'
    case 'blue':
      return 'better'
    case 'purple':
      return plus ? 'excellentPlus' : 'excellent'
    case 'orange':
      return plus ? 'epicPlus' : 'epic'
    case 'red':
      return 'legend'
  }
}
