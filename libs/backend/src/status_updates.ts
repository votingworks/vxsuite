import { deepEqual, deferred, timeout } from '@votingworks/basics';

/** Bounds how long a client holds a request open waiting for a change. */
export const STATUS_UPDATE_TIMEOUT_MS = 30_000;

/** A snapshot of the statuses bundled into one long-poll endpoint. */
export interface StatusUpdate<Statuses> {
  readonly revision: number;
  readonly statuses: Statuses;
}

/** Answers long-polls for changes to a set of statuses. */
export interface StatusUpdates<Statuses> {
  /** Resolves once the revision differs from `since`, or at the timeout. */
  next(since?: number): Promise<StatusUpdate<Statuses>>;
}

interface InFlightRead<Statuses> {
  readonly changes: number;
  readonly update: Promise<StatusUpdate<Statuses>>;
}

/**
 * Serves long-polls for `getStatuses`, re-reading whenever `subscribe`'s
 * listener fires. Expose `next` as a `getStatusUpdate({ since })` endpoint.
 */
export function createStatusUpdates<Statuses>({
  getStatuses,
  subscribe,
}: {
  getStatuses(): Promise<Statuses>;
  subscribe(listener: () => void): void;
}): StatusUpdates<Statuses> {
  let current: StatusUpdate<Statuses> | undefined;
  let changes = 0;
  let inFlight: InFlightRead<Statuses> | undefined;
  let previousRead: Promise<void> = Promise.resolve();
  let changed = deferred<void>();

  function notifyChanged(): void {
    changes += 1;
    changed.resolve();
    changed = deferred();
  }
  subscribe(notifyChanged);

  async function readStatuses(): Promise<StatusUpdate<Statuses>> {
    const statuses = await getStatuses();
    if (!current || !deepEqual(statuses, current.statuses)) {
      current = { revision: (current?.revision ?? 0) + 1, statuses };
    }
    return current;
  }

  function read(): Promise<StatusUpdate<Statuses>> {
    if (inFlight?.changes === changes) return inFlight.update;
    const update = previousRead.then(readStatuses);
    const entry: InFlightRead<Statuses> = { changes, update };
    function clearInFlight() {
      if (inFlight === entry) inFlight = undefined;
    }
    previousRead = update.then(clearInFlight, clearInFlight);
    inFlight = entry;
    return update;
  }

  return {
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
