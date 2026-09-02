import { assert, deferred } from '@votingworks/basics';

export class Lock {
  private inUse = false;
  private readonly resolveFunctions: VoidFunction[] = [];

  async acquire(): Promise<void> {
    if (this.inUse === false) {
      this.inUse = true;
      return Promise.resolve();
    }

    // @coverage-defer
    const { promise, resolve } = deferred<void>();
    // @coverage-defer
    this.resolveFunctions.push(resolve);
    // @coverage-defer
    return promise;
  }

  release(): void {
    // @coverage-defer
    if (this.resolveFunctions.length > 0) {
      const resolve = this.resolveFunctions.shift();
      assert(resolve);
      resolve();
    } else {
      this.inUse = false;
    }
  }
}
