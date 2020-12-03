import { useState, useCallback, useEffect } from 'react'

export function useAsync<T>(asyncFunction: () => Promise<T>, immediate = true) {
  const [value, setValue]: [T | null, any] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  // useCallback ensures useEffect is not called on every render, but only if asyncFunction changes.
  const execute = useCallback(() => {
    setError(null)
    setPending(true)
    setValue(null)

    return asyncFunction()
      .then((response: T) => setValue(response))
      .catch((err: any) => setError(err))
      .finally(() => setPending(false))
  }, [asyncFunction])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [execute, immediate])

  return {
    error,
    execute,
    pending,
    value,
  }
}
