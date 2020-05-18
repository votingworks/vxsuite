// TODO: Replace with library: https://github.com/votingworks/bas/issues/16
import { useEffect, useRef } from 'react'

function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef<() => void>()

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    function tick() {
      if (savedCallback.current) {
        savedCallback.current()
      }
    }
    if (delay !== undefined) {
      const id = setInterval(tick, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}

export default useInterval
