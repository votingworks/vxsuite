import { assert } from '../assert';
import { AsyncIteratorPlusImpl } from './async_iterator_plus';
import { AsyncIteratorPlus, IteratorPlus } from './types';

/**
 * A wrapper around {@link Iterable} that provides additional methods.
 */
export class IteratorPlusImpl<T> implements IteratorPlus<T>, AsyncIterable<T> {
  constructor(private readonly iterable: Iterable<T>) {}

  [Symbol.iterator](): Iterator<T> {
    return this.iterable[Symbol.iterator]();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.async()[Symbol.asyncIterator]();
  }

  async(): AsyncIteratorPlus<T> {
    const { iterable } = this;
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncGenerator<T> {
        for (const value of iterable) {
          yield await Promise.resolve(value);
        }
      })()
    );
  }

  chain<U>(other: Iterable<U>): IteratorPlus<T | U> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        for (const value of iterable) {
          yield value;
        }
        for (const value of other) {
          yield value;
        }
      })()
    ) as IteratorPlus<T | U>;
  }

  /**
   * Yields tuples of one element at a time from {@link iterable}.
   */
  chunks(groupSize: 1): IteratorPlus<[T]>;

  /**
   * Yields tuples of one or two elements at a time from {@link iterable}.
   */
  chunks(groupSize: 2): IteratorPlus<[T] | [T, T]>;

  /**
   * Yields tuples of 1-3 elements from {@link iterable}.
   */
  chunks(groupSize: 3): IteratorPlus<[T] | [T, T] | [T, T, T]>;

  /**
   * Yields tuples of 1-4 elements from {@link iterable}.
   */
  chunks(groupSize: 4): IteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;

  /**
   * Yields arrays of {@link groupSize} or fewer elements from {@link iterable}.
   */
  chunks(groupSize: number): IteratorPlus<T[]>;

  /**
   * Yields arrays of {@link groupSize} or fewer elements from {@link iterable}.
   */
  chunks(groupSize: number): IteratorPlus<T[]> {
    assert(
      groupSize > 0 && Math.floor(groupSize) === groupSize,
      'groupSize must be an integer greater than 0'
    );
    const { iterable } = this;
    const iterator = iterable[Symbol.iterator]();
    let group: T[] = [];

    const result: IterableIterator<T[]> = {
      [Symbol.iterator](): IterableIterator<T[]> {
        return result;
      },
      next() {
        while (group.length < groupSize) {
          const { value, done } = iterator.next();
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

    return new IteratorPlusImpl(result);
  }

  count(): number {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const it of this.iterable) {
      count += 1;
    }
    return count;
  }

  enumerate(): IteratorPlus<[number, T]> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen(): Generator<[number, T]> {
        let index = 0;
        for (const value of iterable) {
          yield [index, value];
          index += 1;
        }
      })()
    );
  }

  every(predicate: (item: T) => unknown): boolean {
    for (const it of this.iterable) {
      if (!predicate(it)) {
        return false;
      }
    }
    return true;
  }

  filter<U extends T>(fn: (value: T) => value is U): IteratorPlus<U>;
  filter(fn: (value: T) => unknown): IteratorPlus<T>;
  filter(fn: (value: T) => unknown): IteratorPlus<T> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        for (const value of iterable) {
          if (fn(value)) {
            yield value;
          }
        }
      })()
    );
  }

  filterMap<U extends NonNullable<unknown>>(
    fn: (value: T, index: number) => U | null | undefined
  ): IteratorPlus<U> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let index = 0;
        for (const value of iterable) {
          const result = fn(value, index);
          if (result !== null && result !== undefined) {
            yield result;
          }
          index += 1;
        }
      })()
    );
  }

  find(predicate: (item: T) => unknown): T | undefined {
    for (const it of this.iterable) {
      if (predicate(it)) {
        return it;
      }
    }
    return undefined;
  }

  first(): T | undefined {
    const { iterable } = this;
    return iterable[Symbol.iterator]().next().value;
  }

  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): IteratorPlus<U> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let index = 0;
        for (const value of iterable) {
          yield* fn(value, index);
          index += 1;
        }
      })()
    );
  }

  groupBy(predicate: (a: T, b: T) => boolean): IteratorPlus<T[]> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let group: T[] = [];
        let previous: T | undefined;
        let isFirst = true;
        for (const value of iterable) {
          if (isFirst || predicate(previous as T, value)) {
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

  isEmpty(): boolean {
    /* istanbul ignore next - `done` is typed as `{ done?: false } | { done: true }`, but in practice is never undefined */
    return this.iterable[Symbol.iterator]().next().done ?? true;
  }

  last(): T | undefined {
    let lastElement: T | undefined;
    for (const it of this.iterable) {
      lastElement = it;
    }
    return lastElement;
  }

  map<U>(fn: (value: T, index: number) => U): IteratorPlus<U> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let index = 0;
        for (const value of iterable) {
          yield fn(value, index);
          index += 1;
        }
      })()
    );
  }

  max(): T extends number ? T | undefined : unknown;
  max(compareFn: (a: T, b: T) => number): T | undefined;
  max(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    return this.min((a, b) => compareFn(b, a));
  }

  maxBy(fn: (item: T) => number): T | undefined {
    return this.minBy((item) => -fn(item));
  }

  min(): T extends number ? T | undefined : unknown;
  min(compareFn?: (a: T, b: T) => number): T | undefined;
  min(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    let min: T | undefined;
    for (const it of this.iterable) {
      if (min === undefined || compareFn(it, min) < 0) {
        min = it;
      }
    }
    return min;
  }

  minBy(fn: (item: T) => number): T | undefined {
    let min: number | undefined;
    let minItem: T | undefined;
    for (const it of this.iterable) {
      const value = fn(it);
      if (min === undefined || value < min) {
        min = value;
        minItem = it;
      }
    }
    return minItem;
  }

  partition(predicate: (item: T) => unknown): [T[], T[]] {
    const left = Array.of<T>();
    const right = Array.of<T>();
    for (const value of this.iterable) {
      if (predicate(value)) {
        left.push(value);
      } else {
        right.push(value);
      }
    }
    return [left, right];
  }

  rev(): IteratorPlus<T> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        const array = [...iterable];
        for (let i = array.length - 1; i >= 0; i -= 1) {
          yield array[i] as T;
        }
      })()
    );
  }

  skip(count: number): IteratorPlus<T> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let remaining = count;
        for (const value of iterable) {
          if (remaining <= 0) {
            yield value;
          } else {
            remaining -= 1;
          }
        }
      })()
    );
  }

  some(predicate: (item: T) => unknown): boolean {
    for (const it of this.iterable) {
      if (predicate(it)) {
        return true;
      }
    }
    return false;
  }

  sum(): T extends number ? number : unknown;
  sum(fn: (item: T) => number): number;
  sum(fn?: (item: T) => number): number | unknown {
    let sum = 0;
    for (const it of this.iterable) {
      sum += fn ? fn(it) : (it as unknown as number);
    }
    return sum;
  }

  take(count: number): IteratorPlus<T> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        let remaining = count;
        for (const value of iterable) {
          if (remaining <= 0) {
            break;
          } else {
            yield value;
            remaining -= 1;
          }
        }
      })()
    );
  }

  toArray(): T[] {
    return [...this.iterable];
  }

  toMap<K>(keySelector: (item: T) => K): Map<K, Set<T>> {
    const { iterable } = this;
    const result = new Map<K, Set<T>>();
    for (const item of iterable) {
      const key = keySelector(item);
      const set = result.get(key) ?? new Set<T>();
      set.add(item);
      result.set(key, set);
    }
    return result;
  }

  toSet(): Set<T> {
    return new Set(this.iterable);
  }

  toString(separator = ''): string {
    return this.toArray().join(separator);
  }

  windows(groupSize: 0): never;
  windows(groupSize: 1): IteratorPlus<[T]>;
  windows(groupSize: 2): IteratorPlus<[T, T]>;
  windows(groupSize: 3): IteratorPlus<[T, T, T]>;
  windows(groupSize: 4): IteratorPlus<[T, T, T, T]>;
  windows(groupSize: 5): IteratorPlus<[T, T, T, T, T]>;
  windows(groupSize: number): IteratorPlus<T[]>;
  windows(groupSize: number): IteratorPlus<T[]> {
    if (groupSize <= 0) {
      throw new Error('groupSize must be greater than 0');
    }

    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        const window: T[] = [];
        for (const value of iterable) {
          window.push(value);
          if (window.length === groupSize) {
            yield window.slice();
            window.shift();
          }
        }
      })()
    );
  }

  zip(): IteratorPlus<[T]>;
  zip<U>(other: Iterable<U>): IteratorPlus<[T, U]>;
  zip<U, V>(other1: Iterable<U>, other2: Iterable<V>): IteratorPlus<[T, U, V]>;
  zip<U, V, W>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>
  ): IteratorPlus<[T, U, V, W]>;
  zip<U, V, W, X>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>
  ): IteratorPlus<[T, U, V, W, X]>;
  zip<U, V, W, X, Y>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>,
    other5: Iterable<Y>
  ): IteratorPlus<[T, U, V, W, X, Y]>;
  zip(...others: Array<Iterable<unknown>>): IteratorPlus<unknown[]> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        const iterators = [iterable, ...others].map((it) =>
          it[Symbol.iterator]()
        );

        while (true) {
          const nexts = iterators.map((iterator) => iterator.next());
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

  zipMin(): IteratorPlus<[T]>;
  zipMin<U>(other: Iterable<U>): IteratorPlus<[T, U]>;
  zipMin<U, V>(
    other1: Iterable<U>,
    other2: Iterable<V>
  ): IteratorPlus<[T, U, V]>;
  zipMin<U, V, W>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>
  ): IteratorPlus<[T, U, V, W]>;
  zipMin<U, V, W, X>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>
  ): IteratorPlus<[T, U, V, W, X]>;
  zipMin<U, V, W, X, Y>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>,
    other5: Iterable<Y>
  ): IteratorPlus<[T, U, V, W, X, Y]>;
  zipMin(...others: Array<Iterable<unknown>>): IteratorPlus<unknown[]> {
    const { iterable } = this;
    return new IteratorPlusImpl(
      (function* gen() {
        const iterators = [iterable, ...others].map((it) =>
          it[Symbol.iterator]()
        );

        while (true) {
          const nexts = iterators.map((iterator) => iterator.next());
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
