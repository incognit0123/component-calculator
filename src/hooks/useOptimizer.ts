import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  OptimizerInput,
  OptimizerResult,
  WorkerMessage,
} from '../optimizer/types'

export interface OptimizerStatus {
  running: boolean
  result: OptimizerResult | null
  error: string | null
  progress: { explored: number; partial: OptimizerResult } | null
}

export function useOptimizer() {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<OptimizerStatus>({
    running: false,
    result: null,
    error: null,
    progress: null,
  })

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(
      new URL('../optimizer/worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setStatus((s) => ({
          ...s,
          progress: { explored: msg.explored, partial: msg.best },
        }))
      } else if (msg.type === 'done') {
        setStatus({
          running: false,
          result: msg.result,
          error: null,
          progress: null,
        })
      } else if (msg.type === 'error') {
        setStatus((s) => ({ ...s, running: false, error: msg.message }))
      }
    })
    workerRef.current = worker
    return worker
  }, [])

  const run = useCallback(
    (input: OptimizerInput) => {
      const worker = ensureWorker()
      setStatus({
        running: true,
        result: null,
        error: null,
        progress: null,
      })
      worker.postMessage(input)
    },
    [ensureWorker],
  )

  const cancel = useCallback(() => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'cancel' })
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return { status, run, cancel }
}
