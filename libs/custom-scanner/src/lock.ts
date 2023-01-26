/**
 * A simple lock implementation.
 */
export class Lock {
  private locked = false;
  private readonly resolvers: Array<() => void> = [];

  /**
   * Waits until the lock has been released and then acquires it. You must call
   * `release` for each call to `acquire`.
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    await new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * Releases the lock.
   */
  release(): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.();
    } else {
      this.locked = false;
    }
  }

  /**
   * Runs a function while holding the lock.
   */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
