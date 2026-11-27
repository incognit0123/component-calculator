/** An RGBA pixel buffer, row-major, 4 bytes per pixel; structurally compatible with DOM `ImageData`. */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function crop(img: RgbaImage, r: Rect): RgbaImage {
  const x0 = Math.max(0, Math.round(r.x))
  const y0 = Math.max(0, Math.round(r.y))
  const w = Math.max(0, Math.min(img.width - x0, Math.round(r.w)))
  const h = Math.max(0, Math.min(img.height - y0, Math.round(r.h)))
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    const src = ((y0 + y) * img.width + x0) * 4
    data.set(img.data.subarray(src, src + w * 4), y * w * 4)
  }
  return { width: w, height: h, data }
}

/** Bilinear resample to an arbitrary size. */
export function resize(img: RgbaImage, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  const sx = img.width / width
  const sy = img.height / height
  for (let y = 0; y < height; y += 1) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5)
    const y1 = Math.min(img.height - 1, Math.floor(fy))
    const y2 = Math.min(img.height - 1, y1 + 1)
    const wy = fy - y1
    for (let x = 0; x < width; x += 1) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5)
      const x1 = Math.min(img.width - 1, Math.floor(fx))
      const x2 = Math.min(img.width - 1, x1 + 1)
      const wx = fx - x1
      const a = (y1 * img.width + x1) * 4
      const b = (y1 * img.width + x2) * 4
      const c = (y2 * img.width + x1) * 4
      const d = (y2 * img.width + x2) * 4
      const o = (y * width + x) * 4
      for (let k = 0; k < 4; k += 1) {
        const top = img.data[a + k] * (1 - wx) + img.data[b + k] * wx
        const bottom = img.data[c + k] * (1 - wx) + img.data[d + k] * wx
        data[o + k] = top * (1 - wy) + bottom * wy
      }
    }
  }
  return { width, height, data }
}
