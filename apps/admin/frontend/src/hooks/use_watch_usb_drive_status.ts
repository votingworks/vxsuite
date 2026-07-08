import { useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { deferred, sleep } from '@votingworks/basics';
import { useEffect } from 'react';
import { getUsbDriveStatus, useApiClient } from '../api';

const WATCH_RETRY_BACKOFF_MS = 1000;

/**
 * Subscribes to USB drive changes via long-polling and keeps the
 * `getUsbDriveStatus` query up to date, returning that query's result.
 *
 * Mount this once per app root. Other components can read the status with
 * `getUsbDriveStatus.useQuery()`, which shares the same query and is kept
 * fresh by the invalidation here (plus the query's own slow fallback poll,
 * which also covers the rare change that lands between long-poll requests).
 */
export function useWatchUsbDriveStatus(): UseQueryResult<UsbDriveStatus> {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;
    const waitForUnmount = deferred<void>();

    void (async () => {
      while (isMounted) {
        try {
          const hasChanged = await Promise.race([
            apiClient.waitForUsbDriveChange(),
            waitForUnmount.promise.then(() => false),
          ]);
          if (hasChanged) {
            await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
          }
        } catch {
          // Back off before retrying so a persistent failure (e.g. the backend
          // restarting) doesn't turn this into a busy loop.
          await sleep(WATCH_RETRY_BACKOFF_MS);
        }
      }
    })();

    return () => {
      isMounted = false;
      waitForUnmount.resolve();
    };
  }, [apiClient, queryClient]);

  return getUsbDriveStatus.useQuery();
}
