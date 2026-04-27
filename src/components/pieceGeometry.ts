export type Cell = readonly [number, number]
type Dir = 'right' | 'down' | 'left' | 'up'
type Vec = readonly [number, number]
type Point = readonly [number, number]

interface Edge {
  start: Point
  end: Point
  dir: Dir
}

const FORWARD: Record<Dir, Vec> = {
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
  up: [0, -1],
}

const INWARD: Record<Dir, Vec> = {
  right: [0, 1],
  down: [-1, 0],
  left: [0, -1],
  up: [1, 0],
}

function isRightTurn(cur: Dir, next: Dir): boolean {
  return (
    (cur === 'right' && next === 'down') ||
    (cur === 'down' && next === 'left') ||
    (cur === 'left' && next === 'up') ||
    (cur === 'up' && next === 'right')
  )
}

export function darken(hex: string, ratio: number): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * ratio)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function tracePerimeter(cells: readonly Cell[]): Edge[] {
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`))
  const has = (r: number, c: number) => cellSet.has(`${r},${c}`)

  const edges: Edge[] = []
  for (const [r, c] of cells) {
    if (!has(r - 1, c))
      edges.push({ start: [c, r], end: [c + 1, r], dir: 'right' })
    if (!has(r, c + 1))
      edges.push({ start: [c + 1, r], end: [c + 1, r + 1], dir: 'down' })
    if (!has(r + 1, c))
      edges.push({ start: [c + 1, r + 1], end: [c, r + 1], dir: 'left' })
    if (!has(r, c - 1))
      edges.push({ start: [c, r + 1], end: [c, r], dir: 'up' })
  }

  if (edges.length === 0) return []

  const startMap = new Map<string, Edge>()
  for (const e of edges) {
    startMap.set(`${e.start[0]},${e.start[1]}`, e)
  }

  const loop: Edge[] = []
  const visited = new Set<Edge>()
  let cur: Edge | undefined = edges[0]
  while (cur && !visited.has(cur)) {
    visited.add(cur)
    loop.push(cur)
    cur = startMap.get(`${cur.end[0]},${cur.end[1]}`)
  }

  // Merge consecutive same-direction edges into long ones.
  const merged: Edge[] = []
  for (const e of loop) {
    const last = merged[merged.length - 1]
    if (last && last.dir === e.dir) {
      merged[merged.length - 1] = { start: last.start, end: e.end, dir: e.dir }
    } else {
      merged.push({ ...e })
    }
  }
  if (
    merged.length > 1 &&
    merged[0].dir === merged[merged.length - 1].dir
  ) {
    merged[0] = {
      start: merged[merged.length - 1].start,
      end: merged[0].end,
      dir: merged[0].dir,
    }
    merged.pop()
  }

  return merged
}

export function piecePath(
  cells: readonly Cell[],
  cellSize: number,
  inset: number,
  cornerR: number,
): string {
  const loop = tracePerimeter(cells)
  const n = loop.length
  if (n === 0) return ''

  const corners: Point[] = []
  for (let i = 0; i < n; i++) {
    const cur = loop[i]
    const next = loop[(i + 1) % n]
    const cx = cur.end[0] * cellSize
    const cy = cur.end[1] * cellSize
    const ic = INWARD[cur.dir]
    const inn = INWARD[next.dir]
    corners.push([
      cx + inset * (ic[0] + inn[0]),
      cy + inset * (ic[1] + inn[1]),
    ])
  }

  const edgeLen: number[] = []
  for (let i = 0; i < n; i++) {
    const a = corners[(i - 1 + n) % n]
    const b = corners[i]
    edgeLen.push(Math.hypot(b[0] - a[0], b[1] - a[1]))
  }

  const radii: number[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.min(cornerR, edgeLen[i] / 2, edgeLen[(i + 1) % n] / 2)
    radii.push(Math.max(0, r))
  }

  const arcStart: Point[] = []
  const arcEnd: Point[] = []
  for (let i = 0; i < n; i++) {
    const cur = loop[i]
    const next = loop[(i + 1) % n]
    const fc = FORWARD[cur.dir]
    const fn = FORWARD[next.dir]
    const r = radii[i]
    arcStart.push([corners[i][0] - r * fc[0], corners[i][1] - r * fc[1]])
    arcEnd.push([corners[i][0] + r * fn[0], corners[i][1] + r * fn[1]])
  }

  const round = (v: number) => v.toFixed(2)
  const parts: string[] = []
  parts.push(`M ${round(arcEnd[n - 1][0])} ${round(arcEnd[n - 1][1])}`)
  for (let i = 0; i < n; i++) {
    parts.push(`L ${round(arcStart[i][0])} ${round(arcStart[i][1])}`)
    if (radii[i] > 0.25) {
      const sweep = isRightTurn(loop[i].dir, loop[(i + 1) % n].dir) ? 1 : 0
      parts.push(
        `A ${round(radii[i])} ${round(radii[i])} 0 0 ${sweep} ${round(arcEnd[i][0])} ${round(arcEnd[i][1])}`,
      )
    }
  }
  parts.push('Z')
  return parts.join(' ')
}
