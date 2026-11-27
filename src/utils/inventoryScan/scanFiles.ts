import { decodeImage, forEachVideoFrame } from './frames'
import type { FrameProgress } from './frames'
import { InventoryScanner } from './track'
import type { ScanSegment } from './track'

export type ScanProgress = FrameProgress & { file: string }

export interface FileSegment extends ScanSegment {
  /** The segment continues from the end of a recording into the next file, so the jump between them was tracked as a scroll. */
  spansFiles: boolean
}

export interface ScanResult {
  segments: FileSegment[]
  /** Names of files the browser reported as neither video nor image. */
  skipped: string[]
}

/** Videos are decoded frame by frame; screenshots are read in file-name order, which phone screenshot names keep chronological. */
export async function scanFiles(
  files: File[],
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const scanner = new InventoryScanner()
  const videos = files.filter((f) => f.type.startsWith('video/'))
  const images = files
    .filter((f) => f.type.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const spansFiles = new Set<number>()
  let tail: { index: number; frames: number } | null = null
  const checkTail = () => {
    if (tail && scanner.result()[tail.index].frames > tail.frames) spansFiles.add(tail.index)
  }
  for (const video of videos) {
    await forEachVideoFrame(
      video,
      (frame) => scanner.addFrame(frame),
      (p) => onProgress?.({ ...p, file: video.name }),
      signal,
    )
    checkTail()
    const segments = scanner.result()
    tail = segments.length > 0 ? { index: segments.length - 1, frames: segments[segments.length - 1].frames } : null
  }
  for (let i = 0; i < images.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    scanner.addFrame(await decodeImage(images[i]))
    onProgress?.({ done: i + 1, total: images.length, file: images[i].name })
  }
  checkTail()
  return {
    segments: scanner.result().map((segment, i) => ({ ...segment, spansFiles: spansFiles.has(i) })),
    skipped: files.filter((f) => !videos.includes(f) && !images.includes(f)).map((f) => f.name),
  }
}
