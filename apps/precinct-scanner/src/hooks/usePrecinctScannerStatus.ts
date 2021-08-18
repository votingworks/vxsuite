import { safeParseJSON } from '@votingworks/types'
import {
  GetScanStatusResponseSchema,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import { useCancelablePromise } from '@votingworks/ui'
import { useState } from 'react'
import useInterval from 'use-interval'

export default function usePrecinctScannerStatus(
  interval: number | false = 100
): ScannerStatus {
  const [scannerStatus, setScannerStatus] = useState(ScannerStatus.Unknown)
  const [isFetchingStatus, setIsFetchingStatus] = useState(false)
  const makeCancelable = useCancelablePromise()

  useInterval(async () => {
    if (isFetchingStatus) {
      return
    }
    setIsFetchingStatus(true)

    const response = await makeCancelable(
      fetch('/scan/status', { headers: { Accept: 'application/json' } })
    )

    setScannerStatus(
      safeParseJSON(await response.text(), GetScanStatusResponseSchema).ok()
        ?.scanner ?? ScannerStatus.Error
    )
    setIsFetchingStatus(false)
  }, interval)

  return scannerStatus
}
