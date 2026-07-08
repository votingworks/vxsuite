import { deferred } from '@votingworks/basics';

/**
 * The result of {@link timeout}: either the awaited promise's value, or a
 * signal that the duration was exceeded before it resolved.
 */
export type TimeoutResult<T> =
  | { type: 'success'; value: T }
  | { type: 'timeout' };

/**
 * Waits until a promise resolves or a specified duration is exceeded,
 * whichever comes first. The timer is always cleared, so a promise that
 * resolves before the deadline leaves no dangling timer behind.
 */
export async function timeout<T>(
  duration: number,
  thenable: Promise<T>
): Promise<TimeoutResult<T>> {
  const { promise, resolve } = deferred<void>();
  const timer = setTimeout(resolve, duration);
  try {
    return await Promise.race([
      thenable.then((value) => ({ type: 'success', value }) as const),
      promise.then(() => ({ type: 'timeout' }) as const),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
