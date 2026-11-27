import { decode } from 'fast-png'
import type { RgbaImage } from './image'

/**
 * Test-only loader for `__fixtures__/*.png`.
 * The fixtures are unedited screenshots from a 1220×2712 phone (most cropped to the component list); never retouch them to make a test pass.
 */
const sources = import.meta.glob<string>('./__fixtures__/*.png', {
  query: '?inline',
  import: 'default',
  eager: true,
})

export const FIXTURE_NAMES = Object.keys(sources).map((p) =>
  p.replace('./__fixtures__/', '').replace('.png', ''),
)

const cache = new Map<string, RgbaImage>()

export function loadFixture(name: string): RgbaImage {
  const hit = cache.get(name)
  if (hit) return hit
  const url = sources[`./__fixtures__/${name}.png`]
  if (!url) throw new Error(`no fixture ${name}`)
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0))
  const png = decode(bytes)
  if (png.channels !== 3 && png.channels !== 4) throw new Error(`unexpected channels ${png.channels}`)
  const data = new Uint8ClampedArray(png.width * png.height * 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j += png.channels) {
    data[i] = png.data[j]
    data[i + 1] = png.data[j + 1]
    data[i + 2] = png.data[j + 2]
    data[i + 3] = png.channels === 4 ? png.data[j + 3] : 255
  }
  const img = { width: png.width, height: png.height, data }
  cache.set(name, img)
  return img
}
