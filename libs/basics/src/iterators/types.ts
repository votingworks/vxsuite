import { MaybePromise } from '../types';

/**
 * An iterable with a number of convenience methods for chaining. Many methods are
 * lazy and return a new `IteratorPlus`, but some are eager and return a concrete
 * value.
 */
export interface IteratorPlus<T> extends Iterable<T> {
  /**
   * Returns an async iterator that yields the same values as this iterator.
   */
  async(): AsyncIteratorPlus<T>;

  /**
   * Chains elements from `this` and `other` together.
   */
  chain<U>(other: Iterable<U>): IteratorPlus<T | U>;

  /**
   * Yields tuples of one element at a time.
   */
  chunks(groupSize: 1): IteratorPlus<[T]>;

  /**
   * Yields tuples of one or two elements at a time.
   */
  chunks(groupSize: 2): IteratorPlus<[T] | [T, T]>;

  /**
   * Yields tuples of 1-3 elements.
   */
  chunks(groupSize: 3): IteratorPlus<[T] | [T, T] | [T, T, T]>;

  /**
   * Yields tuples of 1-4 elements.
   */
  chunks(groupSize: 4): IteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;

  /**
   * Yields arrays of {@link groupSize} or fewer elements.
   */
  chunks(groupSize: number): IteratorPlus<T[]>;

  /**
   * Counts the number of elements in `this`. Consumes the entire contained
   * iterable.
   */
  count(): number;

  /**
   * Enumerates elements along with their index.
   */
  enumerate(): IteratorPlus<[number, T]>;

  /**
   * Determines if all elements satisfy `predicate`. Consumes the contained
   * iterable until a non-matching element is found.
   */
  every(predicate: (item: T) => unknown): boolean;

  /**
   * Filters elements by applying `predicate` to each element.
   */
  filter<U extends T>(fn: (value: T) => value is U): IteratorPlus<U>;

  /**
   * Filters elements by applying `predicate` to each element.
   */
  filter(fn: (value: T) => unknown): IteratorPlus<T>;

  /**
   * Finds an element that satisfies `predicate`. Consumes the contained
   * iterable until a matching element is found.
   */
  find(predicate: (item: T) => unknown): T | undefined;

  /**
   * Returns the first element of `this` or `undefined` if `this` is empty.
   */
  first(): T | undefined;

  /**
   * Maps elements to an iterable of `U` and flattens the result.
   */
  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): IteratorPlus<U>;

  /**
   * Determines whether there are no elements in `this`.
   */
  isEmpty(): boolean;

  /**
   * Returns the last element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   */
  last(): T | undefined;

  /**
   * Yields elements from `this` after applying `fn`.
   */
  map<U>(fn: (value: T, index: number) => U): IteratorPlus<U>;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   */
  max(): T extends number ? T | undefined : unknown;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained
   * iterable.
   */
  max(compareFn: (a: T, b: T) => number): T | undefined;

  /**
   * Returns the element of `this` whose return value from `fn` is the maximum.
   * Returns `undefined` if `this` is empty. Comparison happens using `>` on the
   * return values of `fn`. Consumes the entire contained iterable.
   */
  maxBy(fn: (item: T) => number): T | undefined;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   */
  min(): T extends number ? T | undefined : unknown;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained
   * iterable.
   */
  min(compareFn: (a: T, b: T) => number): T | undefined;

  /**
   * Returns the element of `this` whose return value from `fn` is the minimum.
   * Returns `undefined` if `this` is empty. Comparison happens using `<` on the
   * return values of `fn`. Consumes the entire contained iterable.
   */
  minBy(fn: (item: T) => number): T | undefined;

  /**
   * Partitions elements into two groups. Elements that satisfy `predicate` are
   * placed in the first group, and the rest are placed in the second group.
   * Consumes the entire contained iterable. Element order is preserved.
   */
  partition(predicate: (item: T) => unknown): [T[], T[]];

  /**
   * Yields elements in reverse order. Consumes the entire contained iterable.
   */
  rev(): IteratorPlus<T>;

  /**
   * Ignore the first `count` values.
   */
  skip(count: number): IteratorPlus<T>;

  /**
   * Determines whether any element satisfies `predicate`. Consumes the
   * contained iterable until a matching element is found.
   */
  some(predicate: (item: T) => unknown): boolean;

  /**
   * Sums elements from `this`. Consumes the entire contained iterable.
   */
  sum(): T extends number ? number : unknown;

  /**
   * Sums elements from `this` using `fn` to transform each element. Consumes
   * the entire contained iterable.
   */
  sum(fn: (item: T) => number): number;

  /**
   * Takes up to the first `count` elements.
   */
  take(count: number): IteratorPlus<T>;

  /**
   * Collects all elements from `this` into an array. Consumes the entire
   * contained iterable.
   */
  toArray(): T[];

  /**
   * Groups elements from `this` by applying `keySelector` to each element.
   * Consumes entire the contained iterable.
   */
  toMap<K>(keySelector: (item: T) => K): Map<K, Set<T>>;

  /**
   * Collects all elements from `this` into a set. Consumes the entire contained
   * iterable.
   */
  toSet(): Set<T>;

  /**
   * Throws an error because `groupSize` must be greater than 0.
   */
  windows(groupSize: 0): never;

  /**
   * Yields elements from `this` as 1-element tuples.
   */
  windows(groupSize: 1): IteratorPlus<[T]>;

  /**
   * Yields tuples of two elements at a time.
   */
  windows(groupSize: 2): IteratorPlus<[T, T]>;

  /**
   * Yields tuples of three elements at a time.
   */
  windows(groupSize: 3): IteratorPlus<[T, T, T]>;

  /**
   * Yields tuples of four elements at a time.
   */
  windows(groupSize: 4): IteratorPlus<[T, T, T, T]>;

  /**
   * Yields tuples of five elements at a time.
   */
  windows(groupSize: 5): IteratorPlus<[T, T, T, T, T]>;

  /**
   * Yields tuples of elements at a time.
   */
  windows(groupSize: number): IteratorPlus<T[]>;

  /**
   * Yields elements of `this` as 1-element tuples.
   */
  zip(): IteratorPlus<[T]>;

  /**
   * Yields tuples of size 2 with elements from `this` and `other`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U>(other: Iterable<U>): IteratorPlus<[T, U]>;

  /**
   * Yields tuples of size 3 with elements from `this`, `other1`, and `other2`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V>(other1: Iterable<U>, other2: Iterable<V>): IteratorPlus<[T, U, V]>;

  /**
   * Yields tuples of size 4 with elements from `this`, `other1`, `other2`, and
   * `other3`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>
  ): IteratorPlus<[T, U, V, W]>;

  /**
   * Yields tuples of size 5 with elements from `this`, `other1`, `other2`,
   * `other3`, and `other4`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W, X>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>
  ): IteratorPlus<[T, U, V, W, X]>;

  /**
   * Yields tuples of size 6 with elements from `this`, `other1`, `other2`,
   * `other3`, `other4`, and `other5`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W, X, Y>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>,
    other5: Iterable<Y>
  ): IteratorPlus<[T, U, V, W, X, Y]>;

  /**
   * Yields elements of `this` as 1-element tuples.
   */
  zipMin(): IteratorPlus<[T]>;

  /**
   * Yields tuples of size 2 with elements from `this` and `other` until one
   * iterable is exhausted.
   */
  zipMin<U>(other: Iterable<U>): IteratorPlus<[T, U]>;

  /**
   * Yields tuples of size 3 with elements from `this`, `other1`, and `other2`
   * until one iterable is exhausted.
   */
  zipMin<U, V>(
    other1: Iterable<U>,
    other2: Iterable<V>
  ): IteratorPlus<[T, U, V]>;

  /**
   * Yields tuples of size 4 with elements from `this`, `other1`, `other2`, and
   * `other3` until one iterable is exhausted.
   */
  zipMin<U, V, W>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>
  ): IteratorPlus<[T, U, V, W]>;

  /**
   * Yields tuples of size 5 with elements from `this`, `other1`, `other2`,
   * `other3`, and `other4` until one iterable is exhausted.
   */
  zipMin<U, V, W, X>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>
  ): IteratorPlus<[T, U, V, W, X]>;

  /**
   * Yields tuples of size 6 with elements from `this`, `other1`, `other2`,
   * `other3`, `other4`, and `other5` until one iterable is exhausted.
   */
  zipMin<U, V, W, X, Y>(
    other1: Iterable<U>,
    other2: Iterable<V>,
    other3: Iterable<W>,
    other4: Iterable<X>,
    other5: Iterable<Y>
  ): IteratorPlus<[T, U, V, W, X, Y]>;
}

/**
 * An iterable with a number of convenience methods for chaining. Many methods
 * are lazy and return a new `AsyncIteratorPlus`, but some are eager and return
 * a concrete value.
 */
export interface AsyncIteratorPlus<T> extends AsyncIterable<T> {
  /**
   * Returns `this`.
   */
  async(): AsyncIteratorPlus<T>;

  /**
   * Chains elements from `this` and `other` together.
   */
  chain<U>(other: AsyncIterable<U>): AsyncIteratorPlus<T | U>;

  /**
   * Yields tuples of one element at a time.
   */
  chunks(groupSize: 1): AsyncIteratorPlus<[T]>;

  /**
   * Yields tuples of one or two elements at a time.
   */
  chunks(groupSize: 2): AsyncIteratorPlus<[T] | [T, T]>;

  /**
   * Yields tuples of 1-3 elements.
   */
  chunks(groupSize: 3): AsyncIteratorPlus<[T] | [T, T] | [T, T, T]>;

  /**
   * Yields tuples of 1-4 elements.
   */
  chunks(
    groupSize: 4
  ): AsyncIteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;

  /**
   * Yields arrays of {@link groupSize} or fewer elements.
   */
  chunks(groupSize: number): AsyncIteratorPlus<T[]>;

  /**
   * Counts the number of elements in `this`. Consumes the entire contained iterable.
   */
  count(): Promise<number>;

  /**
   * Enumerates elements along with their index.
   */
  enumerate(): AsyncIteratorPlus<[number, T]>;

  /**
   * Determines if all elements satisfy `predicate`. Consumes the contained
   * iterable until a non-matching element is found.
   */
  every(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean>;

  /**
   * Filters elements from `iterable` by applying `predicate` to each element.
   */
  filter(fn: (value: T) => MaybePromise<unknown>): AsyncIteratorPlus<T>;

  /**
   * Finds an element that satisfies `predicate`. Consumes the contained
   * iterable until a matching element is found.
   */
  find(predicate: (item: T) => MaybePromise<unknown>): Promise<T | undefined>;

  /**
   * Returns the first element of `this` or `undefined` if `this` is empty.
   */
  first(): Promise<T | undefined>;

  /**
   * Maps elements to an async iterable of `U` and flattens the result.
   */
  flatMap<U>(
    fn: (
      value: T,
      index: number
    ) => MaybePromise<Iterable<U> | AsyncIterable<U>>
  ): AsyncIteratorPlus<U>;

  /**
   * Determines whether there are no elements in `this`.
   */
  isEmpty(): Promise<boolean>;

  /**
   * Returns the last element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   */
  last(): Promise<T | undefined>;

  /**
   * Yields elements from `this` after applying `fn`.
   */
  map<U>(
    fn: (value: T, index: number) => MaybePromise<U>
  ): AsyncIteratorPlus<U>;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn` if provided, otherwise using `>` and
   * `<`. Consumes the entire contained iterable.
   */
  max(compareFn?: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Returns the element of `this` whose return value from `fn` is the maximum.
   * Returns `undefined` if `this` is empty. Comparison happens using `>` on the
   * return values of `fn`. Consumes the entire contained iterable.
   */
  maxBy(fn: (item: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn` if provided, otherwise using `>` and
   * `<`. Consumes the entire contained iterable.
   */
  min(compareFn?: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Returns the element of `this` whose return value from `fn` is the minimum.
   * Returns `undefined` if `this` is empty. Comparison happens using `<` on the
   * return values of `fn`. Consumes the entire contained iterable.
   */
  minBy(fn: (item: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Partitions elements into two groups. Elements that satisfy `predicate` are
   * placed in the first group, and the rest are placed in the second group.
   * Consumes the entire contained iterable. Element order is preserved.
   */
  partition(predicate: (item: T) => unknown): Promise<[T[], T[]]>;

  /**
   * Yields elements in reverse order. Consumes the entire contained iterable.
   */
  rev(): AsyncIteratorPlus<T>;

  /**
   * Ignore the first `count` values from the given iterable.
   */
  skip(count: number): AsyncIteratorPlus<T>;

  /**
   * Determines whether any element satisfies `predicate`. Consumes the
   * contained iterable until a matching element is found.
   */
  some(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean>;

  /**
   * Sums elements from `this`. Consumes the entire contained iterable.
   */
  sum(): Promise<T extends number ? number : unknown>;

  /**
   * Sums elements from `this` using `fn` to transform each element. Consumes
   * the entire contained iterable.
   */
  sum(fn: (item: T) => MaybePromise<number>): Promise<number>;

  /**
   * Takes up to the first `count` elements from `iterable`.
   */
  take(count: number): AsyncIteratorPlus<T>;

  /**
   * Collects all elements from `this` into an array. Consumes the contained
   * iterable.
   */
  toArray(): Promise<T[]>;

  /**
   * Groups elements from `this` by applying `keySelector` to each element and
   * consumes the contained iterable.
   */
  toMap<K>(keySelector: (item: T) => MaybePromise<K>): Promise<Map<K, Set<T>>>;

  /**
   * Collects all elements from `this` into a set. Consumes the contained
   * iterable.
   */
  toSet(): Promise<Set<T>>;

  /**
   * Throws an error because `groupSize` must be greater than 0.
   */
  windows(groupSize: 0): never;

  /**
   * Yields elements from `this` as 1-element tuples.
   */
  windows(groupSize: 1): AsyncIteratorPlus<[T]>;

  /**
   * Yields tuples of two elements at a time.
   */
  windows(groupSize: 2): AsyncIteratorPlus<[T, T]>;

  /**
   * Yields tuples of three elements at a time.
   */
  windows(groupSize: 3): AsyncIteratorPlus<[T, T, T]>;

  /**
   * Yields tuples of four elements at a time.
   */
  windows(groupSize: 4): AsyncIteratorPlus<[T, T, T, T]>;

  /**
   * Yields tuples of five elements at a time.
   */
  windows(groupSize: 5): AsyncIteratorPlus<[T, T, T, T, T]>;

  /**
   * Yields tuples of elements at a time.
   */
  windows(groupSize: number): AsyncIteratorPlus<T[]>;

  /**
   * Yields elements of `this` as 1-element tuples.
   */
  zip(): AsyncIteratorPlus<[T]>;

  /**
   * Yields tuples of size 2 with elements from `this` and `other`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U>(other: Iterable<U> | AsyncIterable<U>): AsyncIteratorPlus<[T, U]>;

  /**
   * Yields tuples of size 3 with elements from `this`, `other1`, and `other2`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>
  ): AsyncIteratorPlus<[T, U, V]>;

  /**
   * Yields tuples of size 4 with elements from `this`, `other1`, `other2`, and
   * `other3`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>
  ): AsyncIteratorPlus<[T, U, V, W]>;

  /**
   * Yields tuples of size 5 with elements from `this`, `other1`, `other2`,
   * `other3`, and `other4`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W, X>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>
  ): AsyncIteratorPlus<[T, U, V, W, X]>;

  /**
   * Yields tuples of size 6 with elements from `this`, `other1`, `other2`,
   * `other3`, `other4`, and `other5`.
   *
   * @throws if not all iterables are the same length
   */
  zip<U, V, W, X, Y>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>,
    other5: Iterable<Y> | AsyncIterable<Y>
  ): AsyncIteratorPlus<[T, U, V, W, X, Y]>;

  /**
   * Yields elements of `this` as 1-element tuples.
   */
  zipMin(): AsyncIteratorPlus<[T]>;

  /**
   * Yields tuples of size 2 with elements from `this` and `other` until one
   * iterable is exhausted.
   */
  zipMin<U>(other: Iterable<U> | AsyncIterable<U>): AsyncIteratorPlus<[T, U]>;

  /**
   * Yields tuples of size 3 with elements from `this`, `other1`, and `other2`
   * until one iterable is exhausted.
   */
  zipMin<U, V>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>
  ): AsyncIteratorPlus<[T, U, V]>;

  /**
   * Yields tuples of size 4 with elements from `this`, `other1`, `other2`, and
   * `other3` until one iterable is exhausted.
   */
  zipMin<U, V, W>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>
  ): AsyncIteratorPlus<[T, U, V, W]>;

  /**
   * Yields tuples of size 5 with elements from `this`, `other1`, `other2`,
   * `other3`, and `other4` until one iterable is exhausted.
   */
  zipMin<U, V, W, X>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>
  ): AsyncIteratorPlus<[T, U, V, W, X]>;

  /**
   * Yields tuples of size 6 with elements from `this`, `other1`, `other2`,
   * `other3`, `other4`, and `other5` until one iterable is exhausted.
   */
  zipMin<U, V, W, X, Y>(
    other1: Iterable<U> | AsyncIterable<U>,
    other2: Iterable<V> | AsyncIterable<V>,
    other3: Iterable<W> | AsyncIterable<W>,
    other4: Iterable<X> | AsyncIterable<X>,
    other5: Iterable<Y> | AsyncIterable<Y>
  ): AsyncIteratorPlus<[T, U, V, W, X, Y]>;
}
