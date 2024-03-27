import { assert, deferred } from '@votingworks/basics';

export class Lock {
  private inUse = false;
  private readonly resolveFunctions: VoidFunction[] = [];

  async acquire(): Promise<void> {
    if (this.inUse === false) {
      this.inUse = true;
      return Promise.resolve();
    }

    const { promise, resolve } = deferred<void>();
    this.resolveFunctions.push(resolve);
    return promise;
  }

  release(): void {
    if (this.resolveFunctions.length > 0) {
      const resolve = this.resolveFunctions.shift();
      assert(resolve);
      resolve();
    } else {
      this.inUse = false;
    }
  }
}
