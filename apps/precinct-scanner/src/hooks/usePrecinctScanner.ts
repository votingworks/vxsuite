import { useCancelablePromise } from '@votingworks/ui'
import { useState } from 'react'
import useInterval from 'use-interval'
import { getCurrentStatus, ScannerStatusDetails } from '../api/scan'
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals'

export interface PrecinctScanner {
  status: ScannerStatusDetails
}

export default function usePrecinctScanner(
  interval: number | false = POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
): PrecinctScanner | undefined {
  const [lastStatusString, setLastStatusString] = useState<string>()
  const [status, setStatus] = useState<ScannerStatusDetails>()
  const [isFetchingStatus, setIsFetchingStatus] = useState(false)
  const makeCancelable = useCancelablePromise()

  useInterval(async () => {
    if (isFetchingStatus) {
      return
    }

    try {
      setIsFetchingStatus(true)
      const currentStatus = await makeCancelable(getCurrentStatus())
      const currentStatusString = JSON.stringify(currentStatus)

      if (currentStatusString === lastStatusString) {
        return
      }

      setLastStatusString(currentStatusString)
      setStatus(currentStatus)
    } finally {
      setIsFetchingStatus(false)
    }
  }, interval)

  return status ? { status } : undefined
}
