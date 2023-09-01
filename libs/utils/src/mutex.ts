import { deferred, Optional } from '@votingworks/basics';

interface LockResult<T> {
  value: T;
  unlock(): void;
}

/**
 * A mutual exclusion lock, useful for protecting shared data. Holds a value
 * that can be accessed while the lock is held. Note that nothing guarantees
 * that the value is not referenced elsewhere or mutated while the lock is held.
 * This just makes it easier to do the right thing, especially when using
 * `withLock`.
 */
export class Mutex<T> {
  private locked = false;
  private readonly asyncQueue: Array<() => void> = [];

  constructor(private readonly value: T) {}

  /**
   * Attempts to acquire the lock. If the lock is already acquired, returns
   * `undefined`. Otherwise, acquires the lock and returns the value with an
   * unlock function.
   */
  lock(): Optional<LockResult<T>> {
    if (this.locked) {
      return undefined;
    }

    this.locked = true;
    let unlockCalled = false;

    return {
      value: this.value,
      unlock: () => {
        if (unlockCalled) {
          throw new Error('unlock called more than once');
        }
        unlockCalled = true;
        this.locked = false;
        for (const resolve of this.asyncQueue) {
          resolve();
        }
      },
    };
  }

  /**
   * Acquires the lock or waits until it is available, returning the value with
   * an unlock function once it is acquired.
   */
  async asyncLock(): Promise<LockResult<T>> {
    const { promise, resolve } = deferred<void>();

    for (;;) {
      const unlock = this.lock();

      if (unlock) {
        return unlock;
      }

      this.asyncQueue.push(resolve);
      await promise;
    }
  }

  /**
   * Acquires the lock or waits until it is available, then runs the given
   * function and releases the lock automatically.
   */
  async withLock<U>(fn: (value: T) => Promise<U>): Promise<U> {
    const { value, unlock } = await this.asyncLock();
    try {
      return await fn(value);
    } finally {
      unlock();
    }
  }

  /**
   * Returns `true` if the lock is currently acquired, `false` otherwise.
   */
  isLocked(): boolean {
    return this.locked;
  }
}
