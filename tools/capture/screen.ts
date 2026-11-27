import type { GridGeometry } from '../../src/utils/inventoryScan/grid'
import { findBlobs } from '../../src/utils/inventoryScan/image'
import type { Rect, RgbaImage } from '../../src/utils/inventoryScan/image'
import { isFilterOrange } from '../../src/utils/inventoryScan/indicator'

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

function isIconGrey(d: RgbaImage['data'], i: number): boolean {
  return Math.abs(d[i] - 120) <= 12 && Math.abs(d[i + 1] - 128) <= 12 && Math.abs(d[i + 2] - 150) <= 12
}

/**
 * The open filter panel's eight stat icons, in the game's order (row by row, two per row).
 * Unselected icons are grey squares, the selected one is filter orange; both are about 1.3× the filter box and sit above it.
 */
export function findPanelIcons(img: RgbaImage, box: Rect): Rect[] | null {
  const icons = [...findBlobs(img, isIconGrey), ...findBlobs(img, isFilterOrange)]
    .map((b) => b.rect)
    .filter((r) => {
      const aspect = r.w / r.h
      const scale = r.w / box.w
      return aspect > 0.85 && aspect < 1.18 && scale > 1.1 && scale < 1.6 && r.y + r.h < box.y
    })
    .filter((r) => Math.abs(centre(r).x - centre(box).x) < box.w * 4)
  if (icons.length !== 8) return null
  icons.sort((a, b) => a.y - b.y)
  const rows: Rect[][] = []
  for (let i = 0; i < 8; i += 2) rows.push(icons.slice(i, i + 2).sort((a, b) => a.x - b.x))
  const aligned = rows.every((row, i) => i === 0 || Math.abs(row[0].x - rows[0][0].x) < box.w * 0.3)
  return aligned ? rows.flat() : null
}

/** Saturated pixels in the mount board above the list; it rises if a drag ever drops a component onto the board. */
export function boardActivity(img: RgbaImage, box: Rect): number {
  const top = Math.max(0, Math.round(box.y - img.width * 0.7))
  const bottom = Math.round(box.y - img.width * 0.07)
  const x0 = Math.round(img.width * 0.35)
  const x1 = Math.round(img.width * 0.9)
  let n = 0
  for (let y = top; y < bottom; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4
      const max = Math.max(img.data[i], img.data[i + 1], img.data[i + 2])
      const min = Math.min(img.data[i], img.data[i + 1], img.data[i + 2])
      if (max > 150 && max - min > 90) n += 1
    }
  }
  return n
}

/** Mean absolute difference over the visible list, used to see whether a drag moved it. */
export function listDifference(a: RgbaImage, b: RgbaImage, grid: GridGeometry): number {
  const top = grid.rowTops[0]
  const bottom = Math.min(a.height, top + (grid.pitchY ?? grid.cellSize) * grid.rowTops.length)
  const x0 = grid.columns[0].x
  const last = grid.columns[grid.columns.length - 1]
  const x1 = last.x + last.w
  let sum = 0
  let n = 0
  for (let y = top; y < bottom; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * a.width + x) * 4
      sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])
      n += 3
    }
  }
  return sum / Math.max(1, n)
}

/** The lavender gutter between the two middle columns: dragging there scrolls the list without touching a component. */
export function gutterX(grid: GridGeometry): number {
  const mid = Math.floor(grid.columns.length / 2)
  const left = grid.columns[mid - 1]
  return (left.x + left.w + grid.columns[mid].x) / 2
}
