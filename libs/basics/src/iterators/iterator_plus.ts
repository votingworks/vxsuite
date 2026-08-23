import { assert } from '../assert';
import { Optional } from '../types';
import { AsyncIteratorPlusImpl } from './async_iterator_plus';
import {
  Sink,
  Stage,
  buildIterable,
  drivePipeline,
  enumerateStage,
  filterMapStage,
  filterStage,
  flatMapStage,
  mapStage,
  skipStage,
  takeStage,
  zipArrays,
} from './stages';
import { AsyncIteratorPlus, IteratorPlus, ZipElements } from './types';

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
 *
 * Element-wise transforms accumulate as a list of {@link Stage}s rather than as
 * nested generators. Consumers then run the whole chain in a single pass, which
 * avoids both the intermediate allocations and the per-element generator
 * suspension that nesting would cost. Transforms that reorder or regroup
 * elements are not expressible as stages and compose as generators instead.
 */
export class IteratorPlusImpl<T> implements IteratorPlus<T>, AsyncIterable<T> {
  private readonly source: Iterable<unknown>;
  private readonly stages: readonly Stage[];
  private taken = false;

  constructor(iterable: Iterable<T>, stages: readonly Stage[] = []) {
    this.source = iterable as Iterable<unknown>;
    this.stages = stages;
  }

  /**
   * Marks this pipeline as used, ensuring it can only be consumed once.
   */
  private claim(): void {
    if (this.taken) {
      throw new Error('inner iterable has already been taken');
    }
    this.taken = true;
  }

  /**
   * Claims this pipeline and returns it as a lazily-pulled iterable, for
   * transforms that cannot be expressed as a {@link Stage}.
   */
  private intoInner(): Iterable<T> {
    this.claim();
    return buildIterable(this.source, this.stages) as Iterable<T>;
  }

  /**
   * Claims this pipeline and returns it with `stage` appended.
   */
  private withStage(stage: Stage): IteratorPlusImpl<unknown> {
    this.claim();
    return new IteratorPlusImpl<unknown>(this.source, [...this.stages, stage]);
  }

  /**
   * Claims this pipeline and runs it into `sink` in a single pass.
   */
  /**
   * Whether this pipeline and every one of `others` is a plain array, so that
   * zipping can be done by index.
   */
  private canZipAsArrays(
    others: ReadonlyArray<Iterable<unknown>>
  ): others is ReadonlyArray<readonly unknown[]> {
    return (
      this.stages.length === 0 &&
      Array.isArray(this.source) &&
      others.every((other) => Array.isArray(other))
    );
  }

  private drive(sink: Sink<T>): void {
    this.claim();
    drivePipeline(this.source, this.stages, sink);
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

  chunksExact(chunkSize: 1): IteratorPlus<[T]>;
  chunksExact(chunkSize: 2): IteratorPlus<[T, T]>;
  chunksExact(chunkSize: 3): IteratorPlus<[T, T, T]>;
  chunksExact(chunkSize: 4): IteratorPlus<[T, T, T, T]>;
  chunksExact(chunkSize: number): IteratorPlus<T[]>;
  chunksExact(chunkSize: number): IteratorPlus<T[]> {
    assert(
      chunkSize > 0 && Math.floor(chunkSize) === chunkSize,
      'groupSize must be an integer greater than 0'
    );
    const iterable = this.intoInner();
    const iterator = iterable[Symbol.iterator]();

    const result: IterableIterator<T[]> = {
      [Symbol.iterator](): IterableIterator<T[]> {
        return result;
      },
      next() {
        const chunk: T[] = [];
        while (chunk.length < chunkSize) {
          const { value, done } = iterator.next();
          if (done) {
            break;
          }
          chunk.push(value);
        }
        if (chunk.length === 0) {
          return { done: true, value: undefined };
        }
        if (chunk.length !== chunkSize) {
          throw new Error('Chunk size is not a multiple of the iterator size');
        }
        return { value: chunk, done: false };
      },
    };

    return new IteratorPlusImpl(result);
  }

  count(): number {
    let count = 0;
    this.drive(() => {
      count += 1;
      return true;
    });
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
    return this.withStage(enumerateStage()) as IteratorPlus<[number, T]>;
  }

  every(predicate: (item: T) => unknown): boolean {
    let result = true;
    this.drive((value) => {
      if (!predicate(value)) {
        result = false;
        return false;
      }
      return true;
    });
    return result;
  }

  filter<U extends T>(fn: (value: T) => value is U): IteratorPlus<U>;
  filter(fn: (value: T) => unknown): IteratorPlus<T>;
  filter(fn: (value: T) => unknown): IteratorPlus<T> {
    return this.withStage(filterStage(fn)) as IteratorPlus<T>;
  }

  filterMap<U extends NonNullable<unknown>>(
    fn: (value: T, index: number) => U | null | undefined
  ): IteratorPlus<U> {
    return this.withStage(filterMapStage(fn)) as IteratorPlus<U>;
  }

  find(predicate: (item: T) => unknown): T | undefined {
    let result: T | undefined;
    this.drive((value) => {
      if (predicate(value)) {
        result = value;
        return false;
      }
      return true;
    });
    return result;
  }

  first(): T | undefined {
    this.claim();
    if (this.stages.length === 0) {
      return (this.source as Iterable<T>)[Symbol.iterator]().next().value;
    }
    let result: T | undefined;
    drivePipeline(this.source, this.stages, (value: T) => {
      result = value;
      return false;
    });
    return result;
  }

  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): IteratorPlus<U> {
    return this.withStage(flatMapStage(fn)) as IteratorPlus<U>;
  }

  isEmpty(): boolean {
    let empty = true;
    this.drive(() => {
      empty = false;
      return false;
    });
    return empty;
  }

  join(separator = ''): string {
    return this.toArray().join(separator);
  }

  last(): T | undefined {
    let lastElement: T | undefined;
    this.drive((value) => {
      lastElement = value;
      return true;
    });
    return lastElement;
  }

  map<U>(fn: (value: T, index: number) => U): IteratorPlus<U> {
    return this.withStage(mapStage(fn)) as IteratorPlus<U>;
  }

  max(this: IteratorPlus<number>): T;
  max(compareFn: (a: T, b: T) => number): T | undefined;
  max(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    return this.min((a, b) => compareFn(b, a));
  }

  maxBy(fn: (item: T) => number): T | undefined {
    let max: number | undefined;
    let maxItem: T | undefined;
    this.drive((item) => {
      const value = fn(item);
      if (max === undefined || value > max) {
        max = value;
        maxItem = item;
      }
      return true;
    });
    return maxItem;
  }

  min(this: IteratorPlus<number>): T;
  min(compareFn?: (a: T, b: T) => number): T | undefined;
  min(
    compareFn: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  ): T | undefined | unknown {
    let min: T | undefined;
    this.drive((value) => {
      if (min === undefined || compareFn(value, min) < 0) {
        min = value;
      }
      return true;
    });
    return min;
  }

  partition(predicate: (item: T) => unknown): [T[], T[]] {
    const left = Array.of<T>();
    const right = Array.of<T>();
    this.drive((value) => {
      if (predicate(value)) {
        left.push(value);
      } else {
        right.push(value);
      }
      return true;
    });
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
    let accumulator: Optional<T | U> = initialValue;
    let seeded = initialValue !== undefined;
    let index = 0;
    this.drive((value) => {
      if (!seeded) {
        accumulator = value;
        seeded = true;
        return true;
      }
      accumulator = fn(accumulator as T | U, value, index);
      index += 1;
      return true;
    });
    return accumulator;
  }

  skip(count: number): IteratorPlus<T> {
    return this.withStage(skipStage(count)) as IteratorPlus<T>;
  }

  some(predicate: (item: T) => unknown): boolean {
    let result = false;
    this.drive((value) => {
      if (predicate(value)) {
        result = true;
        return false;
      }
      return true;
    });
    return result;
  }

  sum(this: IteratorPlus<number>): T;
  sum(fn: (item: T) => number): number;
  sum(fn?: (item: T) => number): number | unknown {
    let sum = 0;
    this.drive((value) => {
      sum += fn ? fn(value) : (value as unknown as number);
      return true;
    });
    return sum;
  }

  take(count: number): IteratorPlus<T> {
    return this.withStage(takeStage(count)) as IteratorPlus<T>;
  }

  toArray(): T[] {
    this.claim();
    if (this.stages.length === 0) {
      return [...(this.source as Iterable<T>)];
    }
    const result = Array.of<T>();
    drivePipeline(this.source, this.stages, (value: T) => {
      result.push(value);
      return true;
    });
    return result;
  }

  toMap<K>(keySelector: (item: T) => K): Map<K, Set<T>> {
    const result = new Map<K, Set<T>>();
    this.drive((item) => {
      const key = keySelector(item);
      const set = result.get(key) ?? new Set<T>();
      set.add(item);
      result.set(key, set);
      return true;
    });
    return result;
  }

  toString(separator?: string): string {
    return this.join(separator);
  }

  zip<Others extends ReadonlyArray<Iterable<unknown>>>(
    ...others: Others
  ): IteratorPlus<[T, ...ZipElements<Others>]>;
  zip(...others: Array<Iterable<unknown>>): IteratorPlus<unknown[]> {
    if (this.canZipAsArrays(others)) {
      this.claim();
      return new IteratorPlusImpl(
        zipArrays([this.source as readonly unknown[], ...others])
      );
    }
    const iterable = this.intoInner();
    return new IteratorPlusImpl(
      (function* gen(): IterableIterator<unknown[]> {
        const iterators = [iterable, ...others].map((it) =>
          it[Symbol.iterator]()
        );
        const arity = iterators.length;

        while (true) {
          const values = Array.of<unknown>();
          let doneCount = 0;

          for (let i = 0; i < arity; i += 1) {
            const next = (iterators[i] as Iterator<unknown>).next();
            if (next.done) {
              doneCount += 1;
            } else {
              values.push(next.value);
            }
          }

          if (doneCount === arity) {
            break;
          } else if (doneCount > 0) {
            throw new Error('not all iterables are the same length');
          }

          yield values;
        }
      })()
    );
  }
}
