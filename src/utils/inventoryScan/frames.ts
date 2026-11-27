import type { RgbaImage } from './image'

export interface FrameProgress {
  done: number
  total: number
}

/** Target frames per second of video handed to the scanner; at 30 a normal swipe moves well under half a row between frames. */
export const SAMPLE_FPS = 30

function canvasFor(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  return ctx
}

export async function decodeImage(file: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file)
  const ctx = canvasFor(bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      target.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      target.removeEventListener(event, ok)
      reject(new Error(`video ${event} failed`))
    }
    target.addEventListener(event, ok, { once: true })
    target.addEventListener('error', fail, { once: true })
  })
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Plays a recording and hands each presented frame to `onFrame`, holding only one frame in memory.
 * Playback slows while `onFrame` is busy, so consecutive frames stay about 1/`SAMPLE_FPS` s of video apart; seeking to every frame instead re-decodes from the last keyframe.
 */
export async function forEachVideoFrame(
  file: Blob,
  onFrame: (frame: RgbaImage) => void,
  onProgress?: (p: FrameProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  // Browsers only produce frame callbacks for a video that is in the document.
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  video.src = url
  document.body.appendChild(video)
  try {
    await once(video, 'loadedmetadata')
    if (!video.videoWidth || !Number.isFinite(video.duration)) {
      throw new Error('This browser cannot decode the recording. Try Chrome, or record in H.264.')
    }
    if (!('requestVideoFrameCallback' in video)) {
      await seekThrough(video, onFrame, onProgress, signal)
      return
    }
    const ctx = canvasFor(video.videoWidth, video.videoHeight)
    const total = Math.max(1, Math.floor(video.duration * SAMPLE_FPS))
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (error?: unknown) => {
        if (settled) return
        settled = true
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('error', onError)
        signal?.removeEventListener('abort', onAbort)
        video.pause()
        if (error === undefined) resolve()
        else reject(error)
      }
      const onEnded = () => settle()
      const onError = () => settle(new Error('The recording could not be played to the end.'))
      const onAbort = () => settle(new DOMException('Aborted', 'AbortError'))
      if (signal?.aborted) {
        onAbort()
        return
      }
      video.addEventListener('ended', onEnded)
      video.addEventListener('error', onError)
      signal?.addEventListener('abort', onAbort)
      const onVideoFrame: VideoFrameRequestCallback = (_now, meta) => {
        if (settled) return
        const started = performance.now()
        try {
          ctx.drawImage(video, 0, 0)
          onFrame(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
        } catch (e) {
          settle(e)
          return
        }
        onProgress?.({ done: Math.min(total, Math.round(meta.mediaTime * SAMPLE_FPS)), total })
        const busy = (performance.now() - started) / 1000
        video.playbackRate = clamp(1 / SAMPLE_FPS / (busy + 1 / 60), 0.1, 4)
        video.requestVideoFrameCallback(onVideoFrame)
      }
      video.requestVideoFrameCallback(onVideoFrame)
      video.play().catch(settle)
    })
    onProgress?.({ done: total, total })
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    URL.revokeObjectURL(url)
  }
}

/** Fallback for browsers without `requestVideoFrameCallback`: slow, but it never skips a frame. */
async function seekThrough(
  video: HTMLVideoElement,
  onFrame: (frame: RgbaImage) => void,
  onProgress?: (p: FrameProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const ctx = canvasFor(video.videoWidth, video.videoHeight)
  const total = Math.max(1, Math.floor(video.duration * SAMPLE_FPS))
  for (let i = 0; i < total; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const seeked = once(video, 'seeked')
    video.currentTime = Math.min(video.duration, (i + 0.5) / SAMPLE_FPS)
    await seeked
    ctx.drawImage(video, 0, 0)
    onFrame(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
    onProgress?.({ done: i + 1, total })
  }
}
