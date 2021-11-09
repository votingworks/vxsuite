import { useCallback } from 'react';
import { useMountedState } from './use_mounted_state';

/**
 * React hook for wrapping promises that automatically cancel on unmount.
 *
 * @example
 *
 * const makeCancelable = useCancelablePromise()
 *
 * useEffect(() => {
 *   makeCancelable(fetch('/api')).then((response) => {
 *     setResponse(response)
 *   })
 * }, [makeCancelable])
 */
export function useCancelablePromise(): <Value>(
  promise: Promise<Value>,
  onCancel?: () => void
) => Promise<Value> {
  const isMounted = useMountedState();

  return useCallback(
    async (promise, onCancel) => {
      try {
        const result = await promise;
        if (isMounted()) {
          return result;
        }
      } catch (error) {
        if (isMounted()) {
          throw error;
        }
      } finally {
        if (!isMounted()) {
          onCancel?.();
        }
      }

      return new Promise(() => {
        // never resolves or rejects
      });
    },
    [isMounted]
  );
}
