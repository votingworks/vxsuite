import { assert } from '../assert';
import { Optional } from '../types';
import { AsyncIteratorPlusImpl } from './async_iterator_plus';
import { AsyncIteratorPlus, IteratorPlus } from './types';

/**
 * A wrapper around {@link Iterable} that provides additional methods.
 *
 * This is modeled after Rust's `Iterator` trait and follows similar semantics.
 * See https://doc.rust-lang.org/std/iter/trait.Iterator.html for more. In
 * particular, note {@link IteratorPlus} is a *consumable* iterator, meaning
 * that it can only be iterated over once. This is to prevent bugs where the
 * same iterator is used multiple times, which can lead to unexpected behavior.
 * Methods either create a new {@link IteratorPlus} (transforms) or return a
 * value that is not an iterator (consumers).
 *
 * Note that {@link IteratorPlus} is lazy, meaning that it does not perform any
 * work until it is iterated over. This means that methods like {@link map} and
 * {@link filter} are transforms and do not actually perform any work until a
 * consumer method is called. This is in contrast to {@link Array} methods like
 * `map` and `filter`, which perform work immediately.
 */
export class IteratorPlusImpl<T> implements IteratorPlus<T>, AsyncIterable<T> {
  /**
   * Retrieves the inner iterable, or throws an error if it has already been
   * taken. This ensures that the inner iterable can only be used once.
   */
  private readonly intoInner: () => Iterable<T>;

  constructor(iterable: Iterable<T>) {
    let innerIterable: Iterable<T> | undefined = iterable;

    this.intoInner = () => {
      if (!innerIterable) {
        throw new Error('inner iterable has already been taken');
      }

      const result = innerIterable;
      innerIterable = undefined;
      return result;
    };
  }

  [Symbol.iterator](): Iterator<T> {
    return this.intoInner()[Symbol.iterator]();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.async()[Symbol.asyncIterator]();
  }

  async(): AsyncIteratorPlus<Awaited<T>> {
    const iterable = this.intoInner();
    return new AsyncIteratorPlusImpl(
      (async function* gen(): AsyncGenerator<Awaited<T>> {
        for (const value of iterable) {
          yield await Promise.resolve(value);
        }
      })()
    );
  }

  chain<U>(other: Iterable<U>): IteratorPlus<T | U> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T | U> {
        yield* iterable;
        yield* other;
      })()
    );
  }

  chunks(groupSize: 1): IteratorPlus<[T]>;
  chunks(groupSize: 2): IteratorPlus<[T] | [T, T]>;
  chunks(groupSize: 3): IteratorPlus<[T] | [T, T] | [T, T, T]>;
  chunks(groupSize: 4): IteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;
  chunks(groupSize: number): IteratorPlus<T[]>;
  chunks(groupSize: number): IteratorPlus<T[]> {
    assert(
      groupSize > 0 && Math.floor(groupSize) === groupSize,
      'groupSize must be an integer greater than 0'
    );
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.iterator]();

    const result: IterableIterator<T[]> = {
      [Symbol.iterator](): IterableIterator<T[]> {
        return result;
      },
      next() {
        const group: T[] = [];
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
        return { value: group, done: false };
      },
    };

    return new IteratorPlusImpl(result);
  }

  count(): number {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const it of this.intoInner()) {
      count += 1;
    }
    return count;
  }

  cycle(): IteratorPlus<T> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T> {
        const array = Array.of<T>();

        for (const value of iterable) {
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

  enumerate(): IteratorPlus<[number, T]> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<[number, T]> {
        let index = 0;
        for (const value of iterable) {
          yield [index, value];
          index += 1;
        }
      })()
    );
  }

  every(predicate: (item: T) => unknown): boolean {
    for (const it of this.intoInner()) {
      if (!predicate(it)) {
        return false;
      }
    }
    return true;
  }

  filter<U extends T>(fn: (value: T) => value is U): IteratorPlus<U>;
  filter(fn: (value: T) => unknown): IteratorPlus<T>;
  filter(fn: (value: T) => unknown): IteratorPlus<T> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T> {
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
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<U> {
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
    for (const it of this.intoInner()) {
      if (predicate(it)) {
        return it;
      }
    }
    return undefined;
  }

  first(): T | undefined {
    const iterable = this.intoInner();
    return iterable[Symbol.iterator]().next().value;
  }

  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): IteratorPlus<U> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<U> {
        let index = 0;
        for (const value of iterable) {
          yield* fn(value, index);
          index += 1;
        }
      })()
    );
  }

  groupBy(predicate: (a: T, b: T) => boolean): IteratorPlus<T[]> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T[]> {
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
    /* istanbul ignore next - @preserve `done` is typed as `{ done?: false } | { done: true }`, but in practice is never undefined */
    return this.intoInner()[Symbol.iterator]().next().done ?? true;
  }

  join(separator = ''): string {
    return this.toArray().join(separator);
  }

  last(): T | undefined {
    let lastElement: T | undefined;
    for (const it of this.intoInner()) {
      lastElement = it;
    }
    return lastElement;
  }

  map<U>(fn: (value: T, index: number) => U): IteratorPlus<U> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<U> {
        let index = 0;
        for (const value of iterable) {
          yield fn(value, index);
          index += 1;
        }
      })()
    );
  }

  max(this: IteratorPlus<number>): T;
  max(compareFn: (a: T, b: T) => number): T | undefined;
  max(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    return this.min((a, b) => compareFn(b, a));
  }

  maxBy(fn: (item: T) => number): T | undefined {
    return this.minBy((item) => -fn(item));
  }

  min(this: IteratorPlus<number>): T;
  min(compareFn?: (a: T, b: T) => number): T | undefined;
  min(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    let min: T | undefined;
    for (const it of this.intoInner()) {
      if (min === undefined || compareFn(it, min) < 0) {
        min = it;
      }
    }
    return min;
  }

  minBy(fn: (item: T) => number): T | undefined {
    let min: number | undefined;
    let minItem: T | undefined;
    for (const it of this.intoInner()) {
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
    for (const value of this.intoInner()) {
      if (predicate(value)) {
        left.push(value);
      } else {
        right.push(value);
      }
    }
    return [left, right];
  }

  reduce(fn: (accumulator: T, value: T, index: number) => T): Optional<T>;
  reduce<U>(
    fn: (accumulator: U, value: T, index: number) => U,
    initialValue: U
  ): U;
  reduce<U>(
    fn: (accumulator: T | U, value: T, index: number) => T | U,
    initialValue?: U
  ): Optional<T> | U {
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.iterator]();
    let accumulator: Optional<T | U> =
      initialValue === undefined ? iterator.next().value : initialValue;
    for (
      let index = 0, next = iterator.next();
      !next.done;
      index += 1, next = iterator.next()
    ) {
      accumulator = fn(accumulator as T | U, next.value, index);
    }
    return accumulator;
  }

  rev(): IteratorPlus<T> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T> {
        const array = [...iterable];
        for (let i = array.length - 1; i >= 0; i -= 1) {
          yield array[i] as T;
        }
      })()
    );
  }

  skip(count: number): IteratorPlus<T> {
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T> {
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
    for (const it of this.intoInner()) {
      if (predicate(it)) {
        return true;
      }
    }
    return false;
  }

  sum(this: IteratorPlus<number>): T;
  sum(fn: (item: T) => number): number;
  sum(fn?: (item: T) => number): number | unknown {
    let sum = 0;
    for (const it of this.intoInner()) {
      sum += fn ? fn(it) : (it as unknown as number);
    }
    return sum;
  }

  take(count: number): IteratorPlus<T> {
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.iterator]();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T> {
        for (let remaining = count; remaining > 0; remaining -= 1) {
          const next = iterator.next();
          if (next.done) {
            break;
          }
          yield next.value;
        }
      })()
    );
  }

  toArray(): T[] {
    return [...this.intoInner()];
  }

  toMap<K>(keySelector: (item: T) => K): Map<K, Set<T>> {
    const iterable = this.intoInner();
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
    return new Set(this.intoInner());
  }

  toString(separator?: string): string {
    return this.join(separator);
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

    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<T[]> {
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
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<unknown[]> {
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
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<unknown[]> {
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
