import { useCallback } from 'react'
import useMountedState from './useMountedState'

export default function useCancelablePromise(): <Value>(
  promise: Promise<Value>,
  onCancel?: () => void
) => Promise<Value> {
  const isMounted = useMountedState()

  return useCallback(
    async (promise, onCancel) => {
      try {
        const result = await promise
        if (isMounted()) {
          return result
        }
      } catch (error) {
        if (isMounted()) {
          throw error
        }
      } finally {
        if (!isMounted()) {
          onCancel?.()
        }
      }

      return new Promise(() => {
        // never resolves or rejects
      })
    },
    [isMounted]
  )
}
