import { STAT_KEYS } from '../../data/stats'
import type { Piece, StatKey } from '../../data/types'
import type { ScanSegment } from './track'

export interface SegmentChoice {
  segment: ScanSegment
  /** null skips the segment. */
  stat: StatKey | null
}

export interface ImportPlan {
  /** Pieces to hand to `countPieces`: imported stats from the scan, other stats from the current inventory. */
  pieces: Omit<Piece, 'id'>[]
  importedStats: StatKey[]
  /** Cells whose shape or tier could not be read; the user must add them by hand. */
  unreadable: number
  /** Stats chosen for more than one segment; the segment with the most pieces wins. */
  duplicates: StatKey[]
  /** Stats imported from a segment with no pieces, and how many current pieces of that stat applying removes. */
  cleared: { stat: StatKey; removed: number }[]
}

export function defaultStat(segment: ScanSegment): StatKey | null {
  return segment.filter && segment.filter !== 'all' ? segment.filter : null
}

/** A stat that was not recorded keeps its current pieces, so a partial recording cannot wipe the rest of the inventory. */
export function planImport(choices: SegmentChoice[], current: Piece[]): ImportPlan {
  const byStat = new Map<StatKey, ScanSegment>()
  const duplicates = new Set<StatKey>()
  for (const { segment, stat } of choices) {
    if (!stat) continue
    const prev = byStat.get(stat)
    if (prev) duplicates.add(stat)
    if (!prev || segment.pieces.length > prev.pieces.length) byStat.set(stat, segment)
  }

  const pieces: Omit<Piece, 'id'>[] = []
  let unreadable = 0
  const cleared: ImportPlan['cleared'] = []
  for (const stat of STAT_KEYS) {
    const segment = byStat.get(stat)
    if (!segment) {
      for (const p of current) if (p.stat === stat) pieces.push({ shape: p.shape, quality: p.quality, stat })
      continue
    }
    if (segment.pieces.length === 0) {
      const removed = current.filter((p) => p.stat === stat).length
      if (removed > 0) cleared.push({ stat, removed })
    }
    for (const p of segment.pieces) {
      if (p.shape && p.quality) pieces.push({ shape: p.shape, quality: p.quality, stat })
      else unreadable += 1
    }
  }
  return { pieces, importedStats: [...byStat.keys()], unreadable, duplicates: [...duplicates], cleared }
}
