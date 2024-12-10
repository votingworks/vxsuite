import { assert } from '../assert';
import { MaybePromise, Optional } from '../types';
import { AsyncIteratorPlus } from './types';

/**
 * A wrapper around {@link AsyncIterable} that provides additional methods.
 *
 * This is modeled after Rust's `Iterator` trait and follows similar semantics.
 * See https://doc.rust-lang.org/std/iter/trait.Iterator.html for more. In
 * particular, note {@link AsyncIteratorPlus} is a *consumable* iterator,
 * meaning that it can only be iterated over once. This is to prevent bugs where
 * the same iterator is used multiple times, which can lead to unexpected
 * behavior. Methods either create a new {@link AsyncIteratorPlus} (transforms)
 * or return a value that is not an iterator (consumers).
 *
 * Note that {@link AsyncIteratorPlus} is lazy, meaning that it does not perform
 * any work until it is iterated over. This means that methods like {@link map}
 * and {@link filter} are transforms and do not actually perform any work until
 * a consumer method is called. This is in contrast to {@link Array} methods
 * like `map` and `filter`, which perform work immediately.
 */
export class AsyncIteratorPlusImpl<T> implements AsyncIteratorPlus<T> {
  /**
   * Retrieves the inner iterable, or throws an error if it has already been
   * taken. This ensures that the inner iterable can only be used once.
   */
  private readonly intoInner: () => AsyncIterable<T>;

  constructor(iterable: AsyncIterable<T>) {
    let innerIterable: AsyncIterable<T> | undefined = iterable;

    this.intoInner = () => {
      if (!innerIterable) {
        throw new Error('inner iterable has already been taken');
      }

      const result = innerIterable;
      innerIterable = undefined;
      return result;
    };
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.intoInner()[Symbol.asyncIterator]();
  }

  async(): AsyncIteratorPlus<Awaited<T>> {
    return this as AsyncIteratorPlus<Awaited<T>>;
  }

  chain<U>(other: AsyncIterable<U>): AsyncIteratorPlus<T | U> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T | U> {
        yield* iterable;
        yield* other;
      })()
    );
  }

  chunks(groupSize: 1): AsyncIteratorPlus<[T]>;
  chunks(groupSize: 2): AsyncIteratorPlus<[T] | [T, T]>;
  chunks(groupSize: 3): AsyncIteratorPlus<[T] | [T, T] | [T, T, T]>;
  chunks(
    groupSize: 4
  ): AsyncIteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;
  chunks(groupSize: number): AsyncIteratorPlus<T[]>;
  chunks(groupSize: number): AsyncIteratorPlus<T[]> {
    assert(
      groupSize > 0 && Math.floor(groupSize) === groupSize,
      'groupSize must be an integer greater than 0'
    );
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.asyncIterator]();
    let group: T[] = [];

    const result: AsyncIterableIterator<T[]> = {
      [Symbol.asyncIterator](): AsyncIterableIterator<T[]> {
        return result;
      },
      async next() {
        while (group.length < groupSize) {
          const { value, done } = await iterator.next();
          if (done) {
            break;
          }
          group.push(value);
        }
        if (group.length === 0) {
          return { value: undefined, done: true };
        }
        const value = group;
        group = [];
        return { value, done: false };
      },
    };

    return new AsyncIteratorPlusImpl(result);
  }

  async count(): Promise<number> {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const it of this.intoInner()) {
      count += 1;
    }
    return count;
  }

  cycle(): AsyncIteratorPlus<T> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T> {
        const array = Array.of<T>();
        for await (const value of iterable) {
          array.push(value);
          yield value;
        }

        if (array.length === 0) {
          return;
        }

        while (true) {
          yield* array;
        }
      })()
    );
  }

  enumerate(): AsyncIteratorPlus<[number, T]> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<[number, T]> {
        let index = 0;
        for await (const value of iterable) {
          yield [index, value];
          index += 1;
        }
      })()
    );
  }

  async every(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean> {
    for await (const it of this.intoInner()) {
      if (!(await predicate(it))) {
        return false;
      }
    }
    return true;
  }

  filter(fn: (value: T) => MaybePromise<unknown>): AsyncIteratorPlus<T> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T> {
        for await (const value of iterable) {
          if (await fn(value)) {
            yield value;
          }
        }
      })()
    );
  }

  filterMap<U extends NonNullable<unknown>>(
    fn: (value: T, index: number) => MaybePromise<U | null | undefined>
  ): AsyncIteratorPlus<U> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<U> {
        let index = 0;
        for await (const value of iterable) {
          const mapped = await fn(value, index);
          if (mapped !== null && mapped !== undefined) {
            yield mapped;
          }
          index += 1;
        }
      })()
    );
  }

  async find(
    predicate: (item: T) => MaybePromise<unknown>
  ): Promise<T | undefined> {
    for await (const it of this.intoInner()) {
      if (await predicate(it)) {
        return it;
      }
    }
    return undefined;
  }

  async first(): Promise<T | undefined> {
    const iterable = this.intoInner();
    return (await iterable[Symbol.asyncIterator]().next()).value;
  }

  flatMap<U>(
    fn: (
      value: T,
      index: number
    ) => MaybePromise<Iterable<U> | AsyncIterable<U>>
  ): AsyncIteratorPlus<U> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<U> {
        let index = 0;
        for await (const value of iterable) {
          yield* await fn(value, index);
          index += 1;
        }
      })()
    );
  }

  groupBy(
    predicate: (a: T, b: T) => MaybePromise<boolean>
  ): AsyncIteratorPlus<T[]> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T[]> {
        let group: T[] = [];
        let previous: T | undefined;
        let isFirst = true;
        for await (const value of iterable) {
          if (isFirst || (await predicate(previous as T, value))) {
            group.push(value);
          } else {
            yield group;
            group = [value];
          }
          previous = value;
          isFirst = false;
        }
        if (group.length > 0) {
          yield group;
        }
      })()
    );
  }

  async isEmpty(): Promise<boolean> {
    /* istanbul ignore next - @preserve `done` is typed as `{ done?: false } | { done: true }`, but in practice is never undefined */
    return (await this.intoInner()[Symbol.asyncIterator]().next()).done ?? true;
  }

  async join(separator = ''): Promise<string> {
    return (await this.toArray()).join(separator);
  }

  async last(): Promise<T | undefined> {
    let lastElement: T | undefined;
    for await (const it of this.intoInner()) {
      lastElement = it;
    }
    return lastElement;
  }

  map<U>(
    fn: (value: T, index: number) => MaybePromise<U>
  ): AsyncIteratorPlus<U> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<U> {
        let index = 0;
        for await (const value of iterable) {
          yield await fn(value, index);
          index += 1;
        }
      })()
    );
  }

  max(this: AsyncIteratorPlus<number>): Promise<T | undefined>;
  max(compareFn: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;
  max(
    compareFn: (a: T, b: T) => MaybePromise<number> = (a, b) =>
      a < b ? -1 : a > b ? 1 : 0
  ): Promise<T | undefined | unknown> {
    return this.min((a, b) => compareFn(b, a));
  }

  maxBy(fn: (item: T) => MaybePromise<number>): Promise<T | undefined> {
    return this.minBy(async (item) => -(await fn(item)));
  }

  min(this: AsyncIteratorPlus<number>): Promise<T | undefined>;
  min(compareFn: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;
  async min(
    compareFn: (a: T, b: T) => MaybePromise<number> = (a, b) =>
      a < b ? -1 : a > b ? 1 : 0
  ): Promise<T | undefined | unknown> {
    let min: T | undefined;
    for await (const it of this.intoInner()) {
      if (min === undefined || (await compareFn(it, min)) < 0) {
        min = it;
      }
    }
    return min;
  }

  async minBy(fn: (item: T) => MaybePromise<number>): Promise<T | undefined> {
    let min: number | undefined;
    let minItem: T | undefined;
    for await (const it of this.intoInner()) {
      const value = await fn(it);
      if (min === undefined || value < min) {
        min = value;
        minItem = it;
      }
    }
    return minItem;
  }

  async partition(predicate: (item: T) => unknown): Promise<[T[], T[]]> {
    const left = [];
    const right = [];
    for await (const it of this.intoInner()) {
      if (predicate(it)) {
        left.push(it);
      } else {
        right.push(it);
      }
    }
    return [left, right];
  }

  reduce(
    fn: (accumulator: T, value: T, index: number) => MaybePromise<T>
  ): Promise<Optional<T>>;
  reduce<U>(
    fn: (accumulator: U, value: T, index: number) => MaybePromise<U>,
    initialValue: U
  ): Promise<U>;
  async reduce<U>(
    fn: (accumulator: T | U, value: T, index: number) => MaybePromise<U>,
    initialValue?: U
  ): Promise<Optional<T> | U> {
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.asyncIterator]();
    let accumulator: Optional<T | U> =
      initialValue === undefined ? (await iterator.next()).value : initialValue;
    for (
      let index = 0, next = await iterator.next();
      !next.done;
      index += 1, next = await iterator.next()
    ) {
      accumulator = await fn(accumulator as T | U, next.value, index);
    }
    return accumulator;
  }

  rev(): AsyncIteratorPlus<T> {
    const toArrayPromise = this.toArray();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T> {
        const array = await toArrayPromise;
        for (let i = array.length - 1; i >= 0; i -= 1) {
          yield array[i] as T;
        }
      })()
    );
  }

  async some(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean> {
    for await (const it of this.intoInner()) {
      if (await predicate(it)) {
        return true;
      }
    }
    return false;
  }

  sum(this: AsyncIteratorPlus<number>): Promise<T>;
  sum(fn: (item: T) => MaybePromise<number>): Promise<T>;
  async sum(fn?: (item: T) => MaybePromise<number>): Promise<T | unknown> {
    let sum = 0;
    for await (const it of this.intoInner()) {
      sum += await (fn ? fn(it) : (it as unknown as number));
    }
    return sum;
  }

  skip(count: number): AsyncIteratorPlus<T> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T> {
        let remaining = count;
        for await (const value of iterable) {
          if (remaining <= 0) {
            yield value;
          } else {
            remaining -= 1;
          }
        }
      })()
    );
  }

  take(count: number): AsyncIteratorPlus<T> {
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.asyncIterator]();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T> {
        for (let remaining = count; remaining > 0; remaining -= 1) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          yield next.value;
        }
      })()
    );
  }

  async toArray(): Promise<T[]> {
    const array = [];
    for await (const item of this.intoInner()) {
      array.push(item);
    }
    return array;
  }

  async toMap<K>(
    keySelector: (item: T) => MaybePromise<K>
  ): Promise<Map<K, Set<T>>> {
    const iterable = this.intoInner();
    const result = new Map<K, Set<T>>();
    for await (const item of iterable) {
      const key = await keySelector(item);
      const set = result.get(key) ?? new Set<T>();
      set.add(item);
      result.set(key, set);
    }
    return result;
  }

  async toSet(): Promise<Set<T>> {
    const set = new Set<T>();
    for await (const item of this.intoInner()) {
      set.add(item);
    }
    return set;
  }

  toString(separator?: string): Promise<string> {
    return this.join(separator);
  }

  windows(groupSize: 0): never;
  windows(groupSize: 1): AsyncIteratorPlus<[T]>;
  windows(groupSize: 2): AsyncIteratorPlus<[T, T]>;
  windows(groupSize: 3): AsyncIteratorPlus<[T, T, T]>;
  windows(groupSize: 4): AsyncIteratorPlus<[T, T, T, T]>;
  windows(groupSize: 5): AsyncIteratorPlus<[T, T, T, T, T]>;
  windows(groupSize: number): AsyncIteratorPlus<T[]>;
  windows(groupSize: number): AsyncIteratorPlus<T[]> {
    if (groupSize <= 0) {
      throw new Error('groupSize must be greater than 0');
    }

    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<T[]> {
        const window: T[] = [];
        for await (const value of iterable) {
          window.push(value);
          if (window.length === groupSize) {
            yield window.slice();
            window.shift();
          }
        }
      })()
    );
  }

  zip(): AsyncIteratorPlus<[T]>;
  zip<U>(other: Iterable<U> | AsyncIterable<U>): AsyncIteratorPlus<[T, U]>;
  zip<U, V>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>
  ): AsyncIteratorPlus<[T, U, V]>;
  zip<U, V, W>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>
  ): AsyncIteratorPlus<[T, U, V, W]>;
  zip<U, V, W, X>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>
  ): AsyncIteratorPlus<[T, U, V, W, X]>;
  zip<U, V, W, X, Y>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>,
    other5: Iterable<Y> | AsyncIterable<Y>
  ): AsyncIteratorPlus<[T, U, V, W, X, Y]>;
  zip(
    ...others: Array<Iterable<unknown> | AsyncIterable<unknown>>
  ): AsyncIteratorPlus<unknown[]> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<unknown[]> {
        const iterators = [iterable, ...others].map(
          (it) =>
            /* istanbul ignore next */
            (it as AsyncIterable<unknown>)[Symbol.asyncIterator]?.() ??
            /* istanbul ignore next */
            (it as Iterable<unknown>)[Symbol.iterator]?.()
        );

        while (true) {
          const nexts = await Promise.all(
            iterators.map((iterator) => iterator.next())
          );
          const dones = nexts.filter(({ done }) => done);

          if (dones.length === nexts.length) {
            break;
          } else if (dones.length > 0) {
            throw new Error('not all iterables are the same length');
          }

          yield nexts.map(({ value }) => value);
        }
      })()
    );
  }

  zipMin(): AsyncIteratorPlus<[T]>;
  zipMin<U>(other: Iterable<U> | AsyncIterable<U>): AsyncIteratorPlus<[T, U]>;
  zipMin<U, V>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>
  ): AsyncIteratorPlus<[T, U, V]>;
  zipMin<U, V, W>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>
  ): AsyncIteratorPlus<[T, U, V, W]>;
  zipMin<U, V, W, X>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>
  ): AsyncIteratorPlus<[T, U, V, W, X]>;
  zipMin<U, V, W, X, Y>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>,
    other5: Iterable<Y> | AsyncIterable<Y>
  ): AsyncIteratorPlus<[T, U, V, W, X, Y]>;
  zipMin(
    ...others: Array<AsyncIterable<unknown>>
  ): AsyncIteratorPlus<unknown[]> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncIterableIterator<unknown[]> {
        const iterators = [iterable, ...others].map((it) =>
          it[Symbol.asyncIterator]()
        );

        while (true) {
          const nexts = await Promise.all(
            iterators.map((iterator) => iterator.next())
          );
          const dones = nexts.filter(({ done }) => done);

          if (dones.length === nexts.length) {
            break;
          } else if (dones.length > 0) {
            break;
          }

          yield nexts.map(({ value }) => value);
        }
      })()
    );
  }
}
