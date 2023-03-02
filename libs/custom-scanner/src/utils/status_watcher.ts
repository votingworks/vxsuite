import { ok, Result, sleep, Optional } from '@votingworks/basics';
import { valuesEncodeEquivalently } from '@votingworks/message-coder';
import { ErrorCode, ScannerStatus } from '../types';
import { debug as rootDebug } from '../debug';
import { StatusInternalMessage } from '../protocol';
import { CustomScanner } from '../types/custom_scanner';
import { convertFromInternalStatus } from '../status';

const debug = rootDebug.extend('watchStatus');

const DEFAULT_WATCH_INTERVAL_MS = 250;

/**
 * Watches the status of the scanner and allows stopping.
 */
export interface StatusWatcher
  extends AsyncIterableIterator<Result<ScannerStatus, ErrorCode>> {
  stop(): void;
}

/**
 * Watches scanner status for changes, yielding promises that resolve with new
 * values whenever the changes occur. The watcher can be stopped by calling
 * `stop` on the returned object.
 *
 * Unlike all the other public API methods, this method does not block calls
 * to other public API methods and is not blocked by them. This is because it
 * is intended to be used in a loop and the status calls should not interfere
 * with other API calls.
 *
 * @example
 *
 * ```ts
 * import { createInterface } from 'readline';
 * import { openScanner, watchStatus } from '@votingworks/custom';
 *
 * const scanner = (await openScanner()).assertOk('failed to open scanner');
 * const watcher = watchStatus(scanner);
 * const rl = createInterface(process.stdin);
 *
 * rl.on('line', () => {
 *   watcher.stop();
 *   rl.close();
 * });
 *
 * process.stdout.write('Press enter to stop watching status.\n');
 *
 * for await (const statusResult of watcher) {
 *   if (statusResult.isErr()) {
 *     console.error(statusResult.err());
 *   } else {
 *     const status = statusResult.ok();
 *     console.log(status);
 *   }
 * }
 * ```
 */
export function watchStatus(
  scanner: CustomScanner,
  { interval = DEFAULT_WATCH_INTERVAL_MS }: { interval?: number } = {}
): StatusWatcher {
  debug('watching status');
  let stopping = false;
  let lastStatusResponse: Optional<Result<StatusInternalMessage, ErrorCode>>;

  async function next(): Promise<
    IteratorResult<Result<ScannerStatus, ErrorCode>>
  > {
    debug('requesting next status');
    if (stopping) {
      debug('watching is stopped, returning done');
      return { done: true, value: undefined };
    }

    debug('watcher getting status internal');
    const getStatusRawResult = await scanner.getStatusRaw();

    if (getStatusRawResult.isErr()) {
      if (
        lastStatusResponse?.isErr() &&
        lastStatusResponse.err() === getStatusRawResult.err()
      ) {
        debug(
          'watcher status internal error is the same as last time, waiting %dms before trying again',
          interval
        );
        await sleep(interval);
        return next();
      }

      debug('watcher status internal error is different, returning it');
      lastStatusResponse = getStatusRawResult;
      return { done: false, value: getStatusRawResult };
    }

    const statusInternal = getStatusRawResult.ok();

    if (
      lastStatusResponse?.isOk() &&
      valuesEncodeEquivalently(
        StatusInternalMessage,
        lastStatusResponse.ok(),
        statusInternal
      )
    ) {
      debug(
        'watcher status internal is the same as last time, waiting %dms before trying again',
        interval
      );
      await sleep(interval);
      return next();
    }

    const { status } = convertFromInternalStatus(statusInternal);

    lastStatusResponse = getStatusRawResult;

    debug('watcher status internal is different, returning it: %o', status);
    return {
      done: false,
      value: ok(status),
    };
  }

  return {
    next,

    stop() {
      debug('stopping status watcher');
      stopping = true;
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
