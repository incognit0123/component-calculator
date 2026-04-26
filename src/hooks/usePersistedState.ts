import { useCallback, useEffect, useState } from 'react'

export function usePersistedState<T>(
  key: string,
  initial: T,
  validate?: (raw: unknown) => raw is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return initial
      const parsed = JSON.parse(raw)
      if (validate && !validate(parsed)) return initial
      return parsed as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore quota errors
    }
  }, [key, state])

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) =>
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next,
      )
    },
    [],
  )

  return [state, update]
}
