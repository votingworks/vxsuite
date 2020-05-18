// TODO: Replace with library: https://github.com/votingworks/bas/issues/16
import { useEffect } from 'react'

function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    if (delay !== undefined) {
      const id = setInterval(callback, delay)
      return () => clearInterval(id)
    }
  }, [callback, delay])
}

export default useInterval
