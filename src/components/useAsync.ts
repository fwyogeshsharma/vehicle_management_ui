import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

/**
 * Load something, once, and again when asked.
 *
 * Small on purpose. It exists so that every page reports a failure the same way instead of some
 * of them rendering an empty table when the call actually errored — an empty list and a failed
 * request look identical to the user, and only one of them means "there is nothing here".
 *
 * The `seq` guard drops the result of a superseded request: typing in a search box fires several
 * overlapping calls, and without it the slowest one wins and the table disagrees with the box.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const mine = ++seq.current
    setLoading(true)
    load()
      .then((result) => {
        if (mine !== seq.current) return
        setData(result)
        setError(null)
      })
      .catch((e) => {
        if (mine !== seq.current) return
        setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false)
      })
    // `load` is rebuilt every render, so the caller's deps are the real dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, reload }
}

/** Debounce a value, so a search box does not call the API on every keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
