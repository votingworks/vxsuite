import { useCancelablePromise } from '@votingworks/ui';
import { useRef, useState } from 'react';
import useInterval from 'use-interval';
import { getCurrentStatus, ScannerStatusDetails } from '../api/scan';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';

export interface PrecinctScanner {
  status: ScannerStatusDetails;
}

export function usePrecinctScanner(
  interval: number | false = POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
): PrecinctScanner | undefined {
  const [lastStatusString, setLastStatusString] = useState<string>();
  const [status, setStatus] = useState<ScannerStatusDetails>();
  const isFetchingStatus = useRef(false);
  const makeCancelable = useCancelablePromise();

  useInterval(async () => {
    if (isFetchingStatus.current) {
      return;
    }

    try {
      isFetchingStatus.current = true;
      const currentStatus = await makeCancelable(getCurrentStatus());
      const currentStatusString = JSON.stringify(currentStatus);

      if (currentStatusString === lastStatusString) {
        return;
      }

      setLastStatusString(currentStatusString);
      setStatus(currentStatus);
    } finally {
      isFetchingStatus.current = false;
    }
  }, interval);

  return status ? { status } : undefined;
}
