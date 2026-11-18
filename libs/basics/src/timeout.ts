import { deferred } from './deferred.js';

/** The outcome of {@link timeout}. */
export type TimeoutResult<T> =
  | { readonly type: 'success'; readonly value: T }
  | { readonly type: 'timeout' };

/**
 * Waits for `promise` until `duration` ms pass. The timer is always cleared,
 * and a rejection after the deadline is logged rather than lost.
 */
export function timeout<T>(
  duration: number,
  promise: Promise<T>
): Promise<TimeoutResult<T>>;

/**
 * Runs `work` until `duration` ms pass, then aborts its signal with a
 * `TimeoutError`. The timer is always cleared, and a rejection after the
 * deadline is logged rather than lost.
 */
export function timeout<T>(
  duration: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<TimeoutResult<T>>;

/**
 * Waits for a promise, or runs work with an abort signal, until `duration` ms
 * pass. The timer is always cleared, and a rejection after the deadline is
 * logged rather than lost.
 */
export async function timeout<T>(
  duration: number,
  promiseOrWork: Promise<T> | ((signal: AbortSignal) => Promise<T>)
): Promise<TimeoutResult<T>> {
  const controller = new AbortController();
  const work =
    typeof promiseOrWork === 'function'
      ? promiseOrWork(controller.signal)
      : promiseOrWork;
  const expired = deferred<void>();
  const timer = setTimeout(expired.resolve, duration);
  try {
    const result = await Promise.race([
      work.then((value) => ({ type: 'success', value }) as const),
      expired.promise.then(() => ({ type: 'timeout' }) as const),
    ]);
    if (result.type === 'timeout') {
      work.catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`rejected after timing out at ${duration} ms:`, error);
      });
      controller.abort(
        new DOMException(`timed out after ${duration} ms`, 'TimeoutError')
      );
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
