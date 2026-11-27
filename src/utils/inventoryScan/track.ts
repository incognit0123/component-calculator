import type { QualityTier, ShapeKey, StatKey } from '../../data/types'
import { classifyCell, LOW_CONFIDENCE } from './classify'
import type { CellReading } from './classify'
import { detectGrid } from './grid'
import { crop } from './image'
import type { RgbaImage } from './image'
import { LOW_FILTER_CONFIDENCE, readFilter } from './indicator'
import type { FilterReading } from './indicator'

export type ScanFilter = StatKey | 'all'

export interface ScannedPiece {
  /** Row in the list, counted from the first row seen in the segment. */
  row: number
  col: number
  shape: ShapeKey | null
  quality: QualityTier | null
  confidence: number
  /** The cell image, kept only for pieces the user should check. */
  sample?: RgbaImage
}

export interface ScanSegment {
  filter: ScanFilter | null
  filterConfidence: number
  frames: number
  pieces: ScannedPiece[]
  /** Frame steps whose scroll distance could not be told apart from a whole row more or less. */
  ambiguousSteps: number
}

interface Vote {
  count: number
  confidence: number
  reading: CellReading
}

interface SegmentState {
  cellSize: number | null
  filterVotes: Map<ScanFilter, { count: number; confidence: number }>
  frames: number
  pitch: number | null
  /** Screen y of the previous frame's first full row, and that row's list index. */
  last: { top: number; row: number } | null
  slots: Map<string, Map<string, Vote>>
  samples: Map<string, RgbaImage>
  ambiguousSteps: number
}

function newSegment(): SegmentState {
  return {
    cellSize: null,
    filterVotes: new Map(),
    frames: 0,
    pitch: null,
    last: null,
    slots: new Map(),
    samples: new Map(),
    ambiguousSteps: 0,
  }
}

const readingKey = (r: CellReading) => `${r.shape}|${r.quality}`

function topVote(votes: Map<string, Vote>): Vote {
  let best: Vote | null = null
  for (const v of votes.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.confidence > best.confidence)) best = v
  }
  return best!
}

/** Luma on a coarse grid; recordings hold long still stretches that need not be scanned twice. */
function sparseSignature(img: RgbaImage): Uint8Array {
  const step = Math.max(4, Math.round(img.width / 80))
  const cols = Math.floor(img.width / step)
  const rows = Math.floor(img.height / step)
  const out = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = (y * step * img.width + x * step) * 4
      out[y * cols + x] = (img.data[i] * 3 + img.data[i + 1] * 6 + img.data[i + 2]) / 10
    }
  }
  return out
}

function meanDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

/**
 * Turns an ordered sequence of frames into per-filter piece lists.
 * Consecutive frames must move less than half a row for the scroll to be tracked by row phase alone; larger jumps fall back to matching cells already seen.
 */
export class InventoryScanner {
  private segments: SegmentState[] = []
  private current: SegmentState | null = null
  /** A low-confidence frame whose filter differs from the segment's, held until the next frame confirms the switch. */
  private pending: { img: RgbaImage; filter: FilterReading } | null = null
  private lastSignature: Uint8Array | null = null

  addFrame(img: RgbaImage): void {
    const signature = sparseSignature(img)
    if (this.lastSignature && !this.pending && meanDifference(signature, this.lastSignature) < 1) return
    this.lastSignature = signature
    const filter = readFilter(img)
    if (!filter) return
    if (!this.current || this.dominantFilter(this.current) === filter.filter) {
      this.pending = null
      this.ingest(img, filter)
      return
    }
    // Recorders write a frame only when the screen changes, so a short list can appear in a single frame; the game redraws the filter box and the list together.
    if (filter.confidence >= LOW_FILTER_CONFIDENCE) {
      this.pending = null
      this.current = null
      this.ingest(img, filter)
      return
    }
    if (this.pending?.filter.filter === filter.filter) {
      this.current = null
      this.ingest(this.pending.img, this.pending.filter)
      this.pending = null
      this.ingest(img, filter)
      return
    }
    this.pending = { img, filter }
  }

  private ingest(img: RgbaImage, filter: FilterReading): void {
    if (!this.current) {
      this.current = newSegment()
      this.segments.push(this.current)
    }
    const seg = this.current
    const fv = seg.filterVotes.get(filter.filter) ?? { count: 0, confidence: 0 }
    fv.count += 1
    fv.confidence += filter.confidence
    seg.filterVotes.set(filter.filter, fv)
    seg.frames += 1

    const grid = detectGrid(img)
    if (!grid || grid.rowTops.length === 0) return
    // Install Component opens with a zoom, so cells read before the size settled are discarded.
    if (seg.cellSize !== null && Math.abs(grid.cellSize - seg.cellSize) > seg.cellSize * 0.02) {
      seg.slots.clear()
      seg.samples.clear()
      seg.last = null
      seg.pitch = null
      seg.ambiguousSteps = 0
    }
    seg.cellSize = grid.cellSize
    if (grid.pitchY !== null) seg.pitch = seg.pitch === null ? grid.pitchY : (seg.pitch * 3 + grid.pitchY) / 4
    // Row pitch over cell size measured on the fixtures (266/238), for a segment whose frames so far show a single full row.
    const pitch = seg.pitch ?? grid.cellSize * 1.12

    const readings = grid.cells.map((c) => ({ cell: c, reading: classifyCell(img, c.rect) }))
    const firstRow = this.locateFirstRow(seg, grid.rowTops[0], pitch, readings)
    seg.last = { top: grid.rowTops[0], row: firstRow }

    for (const { cell, reading } of readings) {
      if (!reading) continue
      const key = `${firstRow + cell.row},${cell.col}`
      const votes = seg.slots.get(key) ?? new Map<string, Vote>()
      const rk = readingKey(reading)
      const v = votes.get(rk) ?? { count: 0, confidence: 0, reading }
      v.count += 1
      v.confidence = Math.max(v.confidence, reading.confidence)
      votes.set(rk, v)
      seg.slots.set(key, votes)
      if (reading.confidence < LOW_CONFIDENCE && !seg.samples.has(key)) seg.samples.set(key, crop(img, cell.rect))
    }
  }

  private dominantFilter(seg: SegmentState): ScanFilter | null {
    let best: ScanFilter | null = null
    let bestCount = 0
    for (const [f, v] of seg.filterVotes) {
      if (v.count > bestCount) {
        best = f
        bestCount = v.count
      }
    }
    return best
  }

  private locateFirstRow(
    seg: SegmentState,
    top: number,
    pitch: number,
    readings: { cell: { row: number; col: number }; reading: CellReading | null }[],
  ): number {
    if (!seg.last) return 0
    // Scroll distance in rows if the new first full row is `j` rows further down the list.
    const base = (seg.last.top - top) / pitch
    const scored: { row: number; motion: number; mismatch: number; cost: number }[] = []
    for (let j = -4; j <= 4; j += 1) {
      const row = seg.last.row + j
      const motion = Math.abs(base + j)
      let seen = 0
      let mismatches = 0
      for (const { cell, reading } of readings) {
        const votes = seg.slots.get(`${row + cell.row},${cell.col}`)
        if (!votes || !reading) continue
        seen += 1
        if (readingKey(topVote(votes).reading) !== readingKey(reading)) mismatches += 1
      }
      // A share, not a count: over identical cells a count favours whichever candidate overlaps more cells already seen.
      const mismatch = seen === 0 ? 0.5 : mismatches / seen
      scored.push({ row, motion, mismatch, cost: motion * 0.5 + mismatch * 2 })
    }
    scored.sort((a, b) => a.cost - b.cost)
    const [best] = scored
    const rival = scored.find((s) => s !== best && s.motion < 1)
    if (best.motion > 0.35 && rival && rival.mismatch === best.mismatch) seg.ambiguousSteps += 1
    return best.row
  }

  result(): ScanSegment[] {
    return this.segments.map((seg) => {
      const filter = this.dominantFilter(seg)
      const fv = filter ? seg.filterVotes.get(filter)! : null
      const keys = [...seg.slots.keys()].map((k) => k.split(',').map(Number) as [number, number])
      const minRow = keys.length > 0 ? Math.min(...keys.map(([r]) => r)) : 0
      const pieces = keys
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(([row, col]) => {
          const key = `${row},${col}`
          const vote = topVote(seg.slots.get(key)!)
          const piece: ScannedPiece = {
            row: row - minRow,
            col,
            shape: vote.reading.shape,
            quality: vote.reading.quality,
            confidence: vote.confidence,
          }
          const sample = seg.samples.get(key)
          if (sample && (vote.confidence < LOW_CONFIDENCE || !vote.reading.shape)) piece.sample = sample
          return piece
        })
      return {
        filter,
        filterConfidence: fv ? fv.confidence / fv.count : 0,
        frames: seg.frames,
        pieces,
        ambiguousSteps: seg.ambiguousSteps,
      }
    })
  }
}
