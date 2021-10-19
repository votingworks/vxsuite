import { useCallback, useEffect, useRef } from 'react';

/**
 * React hook for determining the current mounted state for the enclosing
 * component.
 *
 * @example
 *
 * const isMounted = useMountedState()
 *
 * useEffect(() => {
 *   fetch('/api').then((response) => {
 *     if (isMounted()) {
 *       setResponse(response)
 *     }
 *   })
 * }, [isMounted])
 */
export function useMountedState(): () => boolean {
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => mountedRef.current, []);
}
