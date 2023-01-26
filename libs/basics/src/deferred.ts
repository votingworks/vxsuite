/**
 * Type for a deferred promise - see deferred<T>().
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/**
 * Builds a deferred promise that separates the promise itself from the resolve
 * and reject functions, allowing easily passing a promise elsewhere for easy
 * resolution later.
 *
 * @example
 *
 * const { promise, resolve, reject } = deferred<number>()
 * giveThePromiseToSomeone(promise)
 * computeAThingWithACallback((value) => {
 *   if (typeof value === 'number') {
 *     resolve(value)
 *   } else {
 *     reject(new Error('computation failed'))
 *   }
 * })
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * An asynchronous FIFO queue.
 */
class DeferredQueue<T> {
  private readonly deferredGets: Array<Deferred<T>> = [];
  private readonly settlements: Array<PromiseSettledResult<T>> = [];
  private settleAllWith?: PromiseSettledResult<T>;

  /**
   * Determines whether any existing values are present.
   */
  isEmpty(): boolean {
    return this.settlements.length === 0;
  }

  /**
   * Gets a promise for the next value in the queue. If there is a value ready,
   * the promise is resolved immediately with that value. Otherwise it is
   * deferred until a settlement is added. Note that this promise may reject if
   * `reject` or `rejectAll` has been called.
   */
  get(): Promise<T> {
    const nextSettlement = this.settlements.shift();

    if (nextSettlement) {
      if (nextSettlement.status === 'fulfilled') {
        return Promise.resolve(nextSettlement.value);
      }
      return Promise.reject(nextSettlement.reason);
    }

    if (typeof this.settleAllWith !== 'undefined') {
      if (this.settleAllWith.status === 'fulfilled') {
        return Promise.resolve(this.settleAllWith.value);
      }
      return Promise.reject(this.settleAllWith.reason);
    }

    const deferredGet = deferred<T>();
    this.deferredGets.push(deferredGet);
    return deferredGet.promise;
  }

  /**
   * Adds a resolution with `value` to the end of the queue.
   */
  resolve(value: T): void {
    this.assertMutable();
    const nextDeferredGet = this.deferredGets.shift();

    if (nextDeferredGet) {
      nextDeferredGet.resolve(value);
    } else {
      this.settlements.push({ status: 'fulfilled', value });
    }
  }

  /**
   * Once all existing settlements are consumed, all subsequent calls to `get`
   * will be resolved with `value`.
   */
  resolveAll(value: T): void {
    this.assertMutable();
    this.settleAllWith = { status: 'fulfilled', value };

    for (const { resolve } of this.deferredGets) {
      resolve(value);
    }

    this.deferredGets.length = 0;
  }

  /**
   * Adds a rejection for `reason` to the end of the queue.
   */
  reject(reason?: unknown): void {
    this.assertMutable();
    const nextDeferredGet = this.deferredGets.shift();

    if (nextDeferredGet) {
      nextDeferredGet.reject(reason);
    } else {
      this.settlements.push({ status: 'rejected', reason });
    }
  }

  /**
   * Once all existing settlements are consumed, all subsequent calls to `get`
   * will be rejected for `reason`.
   */
  rejectAll(reason?: unknown): void {
    this.assertMutable();
    this.settleAllWith = { status: 'rejected', reason };

    for (const { reject } of this.deferredGets) {
      reject(reason);
    }

    this.deferredGets.length = 0;
  }

  /**
   * Ensures settlements can still be added to the queue.
   */
  private assertMutable(): void {
    if (typeof this.settleAllWith !== 'undefined') {
      throw new Error('resolveAll or rejectAll already called');
    }
  }
}

/**
 * Builds an async FIFO queue.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function deferredQueue<T>(): DeferredQueue<T> {
  return new DeferredQueue();
}
