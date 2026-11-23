import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { deferred, sleep } from '@votingworks/basics';
import { useEffect, useState } from 'react';
import { shouldRetry } from '@votingworks/ui';
import { getUsbDriveStatus, useApiClient } from '../api.js';

const WATCH_RETRY_BACKOFF_MS = 1000;

const UNMOUNTED = Symbol('unmounted');

/** Behind any backend sequence, so the next poll reports and refreshes. */
const UNKNOWN_SEQ = -1;

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
 * fresh by the invalidation here. Throws during render once retries run out.
 */
export function useWatchUsbDriveStatus(): UseQueryResult<UsbDriveStatus> {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ cause: unknown }>();

  useEffect(() => {
    let isMounted = true;
    let lastSeq = 0;
    let failures = 0;
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
          failures = 0;
          if (seq !== lastSeq) {
            lastSeq = seq;
            await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
          }
        } catch (cause) {
          if (!shouldRetry(failures, cause)) {
            setError({ cause });
            break;
          }
          // The backend may have restarted with its sequence back at 0.
          lastSeq = UNKNOWN_SEQ;
          await sleep(WATCH_RETRY_BACKOFF_MS * 2 ** failures);
          failures += 1;
        }
      }
    })();

    return () => {
      isMounted = false;
      waitForUnmount.resolve(UNMOUNTED);
    };
  }, [apiClient, queryClient]);

  const query = getUsbDriveStatus.useQuery();
  if (error) throw error.cause;
  return query;
}
