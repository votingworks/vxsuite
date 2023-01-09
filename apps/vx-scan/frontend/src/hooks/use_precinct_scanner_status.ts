import { Optional } from '@votingworks/types';
import { useCancelablePromise } from '@votingworks/ui';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import { useRef, useState } from 'react';
import useInterval from 'use-interval';
import { useApiClient } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';

export function usePrecinctScannerStatus(
  interval: number | false = POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
): Optional<PrecinctScannerStatus> {
  const apiClient = useApiClient();
  const [status, setStatus] = useState<PrecinctScannerStatus>();
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
    } finally {
      isFetchingStatus.current = false;
    }
  }, interval);

  return status;
}
