import { Optional } from '@votingworks/types';

/**
 * A simple mutex implementation.
 */
export class Mutex {
  private locked = false;

  /**
   * Attempts to acquire the lock. If the lock is already acquired, returns
   * `undefined`. Otherwise, acquires the lock and returns an unlock function.
   */
  lock(): Optional<() => void> {
    if (this.locked) {
      return undefined;
    }

    this.locked = true;
    return () => {
      this.locked = false;
    };
  }

  /**
   * Returns `true` if the lock is currently acquired, `false` otherwise.
   */
  isLocked(): boolean {
    return this.locked;
  }
}
