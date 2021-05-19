import { useCallback, useEffect, useRef } from 'react'

export default function useMountedState(): () => boolean {
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  return useCallback(() => mountedRef.current, [])
}
