import { deepEqual, deferred, timeout } from '@votingworks/basics';
import type { PrecinctScannerStatus } from './types.js';

/** Bounds how long a client holds a request open waiting for a change. */
export const STATUS_UPDATE_TIMEOUT_MS = 30_000;

/** Add a status here to bundle it into the same long-poll request. */
export interface StatusUpdate {
  revision: number;
  statuses: {
    scanner: PrecinctScannerStatus;
  };
}

interface InFlightRead {
  readonly changes: number;
  readonly update: Promise<StatusUpdate>;
}

export function createStatusUpdates({
  getStatuses,
  onChange,
}: {
  getStatuses(): Promise<StatusUpdate['statuses']>;
  onChange(listener: () => void): void;
}): {
  next(since?: number): Promise<StatusUpdate>;
  notifyChanged(): void;
} {
  let current: StatusUpdate | undefined;
  let changes = 0;
  let inFlight: InFlightRead | undefined;
  let previousRead: Promise<void> = Promise.resolve();
  let changed = deferred<void>();

  function notifyChanged(): void {
    changes += 1;
    changed.resolve();
    changed = deferred();
  }
  onChange(notifyChanged);

  async function readStatuses(): Promise<StatusUpdate> {
    const statuses = await getStatuses();
    if (!current || !deepEqual(statuses, current.statuses)) {
      current = { revision: (current?.revision ?? 0) + 1, statuses };
    }
    return current;
  }

  function read(): Promise<StatusUpdate> {
    if (inFlight?.changes === changes) return inFlight.update;
    const update = previousRead.then(readStatuses);
    const entry: InFlightRead = { changes, update };
    function clearInFlight() {
      if (inFlight === entry) inFlight = undefined;
    }
    previousRead = update.then(clearInFlight, clearInFlight);
    inFlight = entry;
    return update;
  }

  return {
    notifyChanged,

    async next(since) {
      const deadline = Date.now() + STATUS_UPDATE_TIMEOUT_MS;
      for (;;) {
        const seenChanges = changes;
        const update = await read();
        const remainingMs = deadline - Date.now();
        if (update.revision !== since || remainingMs <= 0) return update;
        if (changes === seenChanges) {
          const result = await timeout(remainingMs, changed.promise);
          if (result.type === 'timeout') return read();
        }
      }
    },
  };
}
