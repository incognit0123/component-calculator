import type { ShapeKey } from './types'

export type Cell = readonly [number, number]
export type ShapeCells = readonly Cell[]

const raw: Record<ShapeKey, readonly ShapeCells[]> = {
  O: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  I: [
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 0], [1, 0], [2, 0], [3, 0]],
  ],
  T: [
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [0, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 0]],
  ],
  L: [
    [[0, 0], [1, 0], [2, 0], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 0], [1, 1], [1, 2]],
  ],
  J: [
    [[0, 1], [1, 1], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 0], [0, 1], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [0, 2], [1, 2]],
  ],
}

function normalize(cells: ShapeCells): ShapeCells {
  let minR = Infinity
  let minC = Infinity
  for (const [r, c] of cells) {
    if (r < minR) minR = r
    if (c < minC) minC = c
  }
  return cells
    .map(([r, c]) => [r - minR, c - minC] as Cell)
    .sort(([ar, ac], [br, bc]) => ar - br || ac - bc)
}

function dedupe(rots: ShapeCells[]): ShapeCells[] {
  const seen = new Set<string>()
  const out: ShapeCells[] = []
  for (const r of rots) {
    const key = r.map(([rr, cc]) => `${rr},${cc}`).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export const SHAPE_ROTATIONS: Record<ShapeKey, ShapeCells[]> = {
  O: dedupe(raw.O.map(normalize)),
  I: dedupe(raw.I.map(normalize)),
  T: dedupe(raw.T.map(normalize)),
  L: dedupe(raw.L.map(normalize)),
  J: dedupe(raw.J.map(normalize)),
}

export const SHAPE_KEYS: ShapeKey[] = ['O', 'I', 'T', 'L', 'J']

export const MIN_PIECE_CELLS = (() => {
  let min = Infinity
  for (const rotations of Object.values(SHAPE_ROTATIONS)) {
    for (const rot of rotations) {
      if (rot.length < min) min = rot.length
    }
  }
  return min
})()

export function shapeBounds(cells: ShapeCells): { rows: number; cols: number } {
  let maxR = 0
  let maxC = 0
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  return { rows: maxR + 1, cols: maxC + 1 }
}
