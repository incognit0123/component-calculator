/// <reference lib="webworker" />
import { solve } from './solve'
import type {
  OptimizerInput,
  OptimizerResult,
  WorkerMessage,
} from './types'

let cancelled = false

const ctx: DedicatedWorkerGlobalScope =
  self as unknown as DedicatedWorkerGlobalScope

ctx.addEventListener(
  'message',
  async (e: MessageEvent<OptimizerInput | { type: 'cancel' }>) => {
    const data = e.data
    if (
      data &&
      typeof data === 'object' &&
      (data as { type?: string }).type === 'cancel'
    ) {
      cancelled = true
      return
    }
    cancelled = false
    const input = data as OptimizerInput
    try {
      const onProgress = (best: OptimizerResult, explored: number) => {
        const msg: WorkerMessage = { type: 'progress', best, explored }
        ctx.postMessage(msg)
      }
      const result = await solve(input.pieces, input.currentStats, {
        mode: input.mode,
        timeBudgetMs: input.timeBudgetMs,
        isCancelled: () => cancelled,
        onProgress,
      })
      const msg: WorkerMessage = { type: 'done', result }
      ctx.postMessage(msg)
    } catch (err) {
      const msg: WorkerMessage = {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      }
      ctx.postMessage(msg)
    }
  },
)
