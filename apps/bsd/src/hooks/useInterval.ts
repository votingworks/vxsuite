// TODO: Replace with library: https://github.com/votingworks/bas/issues/16
import { useEffect, useRef } from 'react'

const noop = () => {}

function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef(noop)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    function tick() {
      savedCallback.current()
    }
    if (delay !== undefined) {
      let id = setInterval(tick, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}

export default useInterval
