import type { RgbaImage, Rect } from './image'

export interface GridColumn {
  x: number
  w: number
}

export interface GridCell {
  /** 0 = topmost fully visible row in this frame. */
  row: number
  col: number
  rect: Rect
}

export interface GridGeometry {
  columns: GridColumn[]
  /** Cell edge length; cells are square. */
  cellSize: number
  /** Distance between consecutive row tops, or null when fewer than two full rows are visible. */
  pitchY: number | null
  /** Top edge of each fully visible row, ascending. */
  rowTops: number[]
  /** Fully visible, non-empty-slot cells. */
  cells: GridCell[]
}

/** The list panel's lavender background, also visible in the gutters between cells. */
export function isPanel(d: RgbaImage['data'], i: number): boolean {
  const r = d[i]
  const g = d[i + 1]
  const b = d[i + 2]
  return (
    r >= 145 && r <= 195 && g >= 145 && g <= 195 && b >= 190 && b <= 240 && b - r >= 22 && Math.abs(r - g) <= 14
  )
}

interface Segment {
  x0: number
  x1: number
}

/** Non-panel runs bounded by panel pixels on both sides. */
function rowSegments(img: RgbaImage, y: number, minWidth: number): Segment[] {
  const { width, data } = img
  const out: Segment[] = []
  let start = -1
  let seenPanel = false
  for (let x = 0; x < width; x += 1) {
    const panel = isPanel(data, (y * width + x) * 4)
    if (panel) {
      if (start >= 0 && seenPanel && x - start >= minWidth) out.push({ x0: start, x1: x })
      start = -1
      seenPanel = true
    } else if (start < 0) {
      start = x
    }
  }
  return out
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * A row of cells shows as at least three equal-width segments with equal gaps.
 * Lock badges overhang the gutters on some rows, merging two cells, so only rows that pass this check vote.
 */
function detectColumns(img: RgbaImage): GridColumn[] | null {
  const minWidth = Math.round(img.width * 0.08)
  const votes = new Map<number, Segment[][]>()
  const step = Math.max(1, Math.round(img.height / 600))
  for (let y = 0; y < img.height; y += step) {
    const segs = rowSegments(img, y, minWidth)
    if (segs.length < 3) continue
    const widths = segs.map((s) => s.x1 - s.x0)
    const w = median(widths)
    if (widths.some((v) => Math.abs(v - w) > w * 0.04)) continue
    const gaps = segs.slice(1).map((s, i) => s.x0 - segs[i].x1)
    const g = median(gaps)
    if (gaps.some((v) => Math.abs(v - g) > Math.max(3, w * 0.03))) continue
    const list = votes.get(segs.length) ?? []
    list.push(segs)
    votes.set(segs.length, list)
  }
  let best: Segment[][] | null = null
  for (const list of votes.values()) if (!best || list.length > best.length) best = list
  if (!best || best.length < 3) return null
  const n = best[0].length
  return Array.from({ length: n }, (_, c) => {
    const x0 = median(best.map((segs) => segs[c].x0))
    const x1 = median(best.map((segs) => segs[c].x1))
    return { x: x0, w: x1 - x0 }
  })
}

interface Run {
  y0: number
  y1: number
}

/** Vertical non-panel runs down a strip just inside the cells' left edge, where neither pieces nor lock badges reach. */
function columnRuns(img: RgbaImage, col: GridColumn): Run[] {
  const { width, height, data } = img
  const x = Math.round(col.x + col.w * 0.08)
  const out: Run[] = []
  let start = -1
  let seenPanel = false
  for (let y = 0; y < height; y += 1) {
    const panel = isPanel(data, (y * width + x) * 4)
    if (panel) {
      if (start >= 0 && seenPanel) out.push({ y0: start, y1: y })
      start = -1
      seenPanel = true
    } else if (start < 0) {
      start = y
    }
  }
  return out
}

export function detectGrid(img: RgbaImage): GridGeometry | null {
  const columns = detectColumns(img)
  if (!columns) return null
  const cellSize = median(columns.map((c) => c.w))
  const tolerance = cellSize * 0.06

  const fullTops: { col: number; y: number }[] = []
  for (let c = 0; c < columns.length; c += 1) {
    for (const run of columnRuns(img, columns[c])) {
      const len = run.y1 - run.y0
      if (Math.abs(len - cellSize) <= tolerance) fullTops.push({ col: c, y: run.y0 })
    }
  }
  if (fullTops.length === 0) return null

  const sorted = fullTops.map((t) => t.y).sort((a, b) => a - b)
  const rowTops: number[] = []
  for (const y of sorted) {
    const last = rowTops[rowTops.length - 1]
    if (last === undefined || y - last > tolerance) rowTops.push(y)
  }
  const pitches = rowTops.slice(1).map((y, i) => y - rowTops[i])
  const pitchY = pitches.length > 0 ? median(pitches) : null

  const cells: GridCell[] = fullTops
    .map(({ col, y }) => {
      const row = rowTops.findIndex((t) => Math.abs(t - y) <= tolerance)
      return { row, col, rect: { x: columns[col].x, y, w: columns[col].w, h: cellSize } }
    })
    .sort((a, b) => a.row - b.row || a.col - b.col)

  return { columns, cellSize, pitchY, rowTops, cells }
}
