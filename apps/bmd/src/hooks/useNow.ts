import { DateTime } from 'luxon'
import { useState } from 'react'
import useInterval from 'use-interval'

/**
 * Returns a current-to-the-second date.
 */
const useNow = (): DateTime => {
  const [now, setNow] = useState(DateTime.local())

  useInterval(() => {
    setNow(DateTime.local())
  }, 1000)

  return now
}

export default useNow
