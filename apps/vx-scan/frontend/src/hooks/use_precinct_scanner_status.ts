import { Scan } from '@votingworks/api';
import { Optional } from '@votingworks/types';
import { useCancelablePromise } from '@votingworks/ui';
import { useRef, useState } from 'react';
import useInterval from 'use-interval';
import { useApiClient } from '../api/api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';

export function usePrecinctScannerStatus(
  interval: number | false = POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
): Optional<Scan.PrecinctScannerStatus> {
  const apiClient = useApiClient();
  const [status, setStatus] = useState<Scan.PrecinctScannerStatus>();
  const isFetchingStatus = useRef(false);
  const makeCancelable = useCancelablePromise();

  useInterval(async () => {
    if (isFetchingStatus.current) {
      return;
    }

    try {
      isFetchingStatus.current = true;
      const currentStatus = await makeCancelable(apiClient.getScannerStatus());
      setStatus(currentStatus);
    } catch (error) {
      console.error(error);
    } finally {
      isFetchingStatus.current = false;
    }
  }, interval);

  return status;
}
