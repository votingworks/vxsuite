import { sleep } from '@votingworks/basics';
import { useEffect, useState } from 'react';
import { shouldRetry } from '../react_query.js';

const STATUS_UPDATE_RETRY_DELAY_MS = 1000;

/**
 * Long-polls a backend `getStatusUpdate` endpoint, passing each update to
 * `onUpdate`. Both callbacks must be stable. Mount once, at the app root.
 * Throws during render once retries are exhausted, like a failed query would.
 */
export function useStatusUpdates<Update extends { readonly revision: number }>({
  getStatusUpdate,
  onUpdate,
}: {
  getStatusUpdate(input: { since?: number }): Promise<Update>;
  onUpdate(update: Update): void;
}): void {
  const [error, setError] = useState<{ cause: unknown }>();

  useEffect(() => {
    let isCanceled = false;

    async function pollForever(): Promise<void> {
      let since: number | undefined;
      let failures = 0;
      while (!isCanceled) {
        try {
          const update = await getStatusUpdate({ since });
          if (isCanceled) return;
          since = update.revision;
          failures = 0;
          onUpdate(update);
        } catch (cause) {
          if (isCanceled) return;
          if (!shouldRetry(failures, cause)) {
            setError({ cause });
            return;
          }
          since = undefined;
          await sleep(STATUS_UPDATE_RETRY_DELAY_MS * 2 ** failures);
          failures += 1;
        }
      }
    }

    void pollForever();
    return () => {
      isCanceled = true;
    };
  }, [getStatusUpdate, onUpdate]);

  if (error) throw error.cause;
}
