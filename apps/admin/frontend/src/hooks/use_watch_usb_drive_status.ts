import { useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { deferred, sleep } from '@votingworks/basics';
import { useEffect } from 'react';
import { getUsbDriveStatus, useApiClient } from '../api.js';

const WATCH_RETRY_BACKOFF_MS = 1000;

const UNMOUNTED = Symbol('unmounted');

/**
 * Subscribes to USB drive changes via long-polling and keeps the
 * `getUsbDriveStatus` query up to date, returning that query's result.
 *
 * Each long-poll passes the last change sequence it saw; the backend replies
 * with the current sequence once it is ahead, so a change that lands between
 * two polls is reported on the next one rather than lost.
 *
 * Mount this once per app root. Other components can read the status with
 * `getUsbDriveStatus.useQuery()`, which shares the same query and is kept
 * fresh by the invalidation here.
 */
export function useWatchUsbDriveStatus(): UseQueryResult<UsbDriveStatus> {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;
    let lastSeq = 0;
    const waitForUnmount = deferred<typeof UNMOUNTED>();

    void (async () => {
      while (isMounted) {
        try {
          const seq = await Promise.race([
            apiClient.waitForUsbDriveChange({ lastSeq }),
            waitForUnmount.promise,
          ]);
          if (seq === UNMOUNTED) {
            break;
          }
          if (seq !== lastSeq) {
            lastSeq = seq;
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
      waitForUnmount.resolve(UNMOUNTED);
    };
  }, [apiClient, queryClient]);

  return getUsbDriveStatus.useQuery();
}
