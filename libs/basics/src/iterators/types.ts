import { MaybePromise, Optional } from '../types';

/**
 * An iterable with a number of convenience methods for chaining. Many methods are
 * lazy and return a new `IteratorPlus`, but some are eager and return a concrete
 * value.
 */
export interface IteratorPlus<T> extends Iterable<T> {
  /**
   * Returns an async iterator that yields the same values as this iterator.
   */
  async(): AsyncIteratorPlus<Awaited<T>>;

  /**
   * Chains elements from `this` and `other` together.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).chain([4, 5, 6]).toArray()).toEqual([1, 2, 3, 4, 5, 6]);
   * ```
   */
  chain<U>(other: Iterable<U>): IteratorPlus<T | U>;

  /**
   * Yields tuples of one element at a time.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).chunks(1).toArray()).toEqual([[1], [2], [3]]);
   * ```
   */
  chunks(groupSize: 1): IteratorPlus<[T]>;

  /**
   * Yields 2-element tuples, plus a 1-element tuple if there is a final
   * element.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).chunks(2).toArray()).toEqual([[1, 2], [3]]);
   * ```
   */
  chunks(groupSize: 2): IteratorPlus<[T] | [T, T]>;

  /**
   * Yields 3-element tuples, plus a 1- or 2-element tuple if there are
   * remaining elements.
   *
   * @example
   *
   * ```ts
   * expect(naturals().take(10).chunks(3).toArray()).toEqual([
   *   [1, 2, 3],
   *   [4, 5, 6],
   *   [7, 8, 9],
   *   [10],
   * ]);
   * ```
   */
  chunks(groupSize: 3): IteratorPlus<[T] | [T, T] | [T, T, T]>;

  /**
   * Yields 4-element tuples, plus a 1-3-element tuple if there are remaining
   * elements.
   *
   * @example
   *
   * ```ts
   * expect(naturals().take(10).chunks(4).toArray()).toEqual([
   *   [1, 2, 3, 4],
   *   [5, 6, 7, 8],
   *   [9, 10],
   * ]);
   * ```
   */
  chunks(groupSize: 4): IteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;

  /**
   * Yields arrays of {@link groupSize} elements, plus a smaller array if there
   * are remaining elements.
   */
  chunks(groupSize: number): IteratorPlus<T[]>;

  /**
   * Counts the number of elements in `this`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([]).count()).toEqual(0);
   * expect(iter([1, 2, 3, 4, 5]).count()).toEqual(5);
   * expect(iter(naturals()).take(100).skip(50).count()).toEqual(50);
   * ```
   */
  count(): number;

  /**
   * Cycles elements from `this` indefinitely.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).cycle().take(7).toArray()).toEqual([1, 2, 3, 1, 2, 3, 1]);
   * ```
   */
  cycle(): IteratorPlus<T>;

  /**
   * Enumerates elements along with their index.
   *
   * @example
   *
   * ```ts
   * expect(iter(['a', 'b', 'c']).enumerate().toArray()).toEqual([
   *   [0, 'a'],
   *   [1, 'b'],
   *   [2, 'c'],
   * ]);
   * ```
   */
  enumerate(): IteratorPlus<[number, T]>;

  /**
   * Determines if all elements satisfy `predicate`. Consumes the contained
   * iterable until a non-matching element is found.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).every((n) => n % 2 === 0)).toBe(false);
   * expect(iter([1, 2, 3, 4, 5]).every((n) => n < 10)).toBe(true);
   * ```
   */
  every(predicate: (item: T) => unknown): boolean;

  /**
   * Filters elements by applying `predicate` to each element.
   *
   * @example
   *
   * ```ts
   * const contests = iter(election.contests);
   * const candidateContests = contests.filter(
   *   (contest): contest is CandidateContest => contest.type === 'candidate'
   * );
   * ```
   */
  filter<U extends T>(fn: (value: T) => value is U): IteratorPlus<U>;

  /**
   * Filters elements by applying `predicate` to each element.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter([1, 2, 3, 4, 5])
   *     .filter((n) => n % 2 === 0)
   *     .toArray()
   * ).toEqual([2, 4]);
   * ```
   */
  filter(fn: (value: T) => unknown): IteratorPlus<T>;

  /**
   * Filters and maps elements from `iterable` by applying `fn` to each element,
   * treating nullish return values as elements to be filtered out.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter(['1', 'two', 'NaN', 'four', '5'])
   *     .filterMap((s) => safeParseInt(s).ok())
   *     .toArray()
   * ).toEqual([1, 5]);
   * ```
   */
  filterMap<U extends NonNullable<unknown>>(
    fn: (value: T, index: number) => U | null | undefined
  ): IteratorPlus<U>;

  /**
   * Finds an element that satisfies `predicate`. Consumes the contained
   * iterable until a matching element is found.
   *
   * @example
   *
   * ```ts
   * const numbers = iter([1, 2, 3, 4, 5]);
   * expect(numbers.find((n) => n % 2 === 0)).toEqual(2);
   * expect(numbers.toArray()).toEqual([3, 4, 5]);
   * ```
   */
  find(predicate: (item: T) => unknown): T | undefined;

  /**
   * Returns the first element of `this` or `undefined` if `this` is empty.
   *
   * @example
   *
   * ```ts
   * expect(iter([10, 40, 30]).first()).toEqual(10);
   * expect(iter([]).first()).toBeUndefined();
   * ```
   */
  first(): T | undefined;

  /**
   * Maps elements to an iterable of `U` and flattens the result.
   *
   * @example
   *
   * ```ts
   * const input = [['a', 'b'], ['c', 'd'], ['e', 'f']];
   * const flattened = iter(input).flatMap((pair) => pair);
   * expect(flattened.toArray()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
   * ```
   */
  flatMap<U>(fn: (value: T, index: number) => Iterable<U>): IteratorPlus<U>;

  /**
   * Returns an iterator that produces non-overlapping runs of elements from
   * `this` using `predicate` to separate runs.
   *
   * @example
   *
   * ```ts
   * const input = [1, 1, 2, 3, 3, 4, 5, 5, 5];
   * const groups = iter(input).groupBy((a, b) => a === b);
   *
   * expect(groups.toArray()).toEqual([
   *   [1, 1],
   *   [2],
   *   [3, 3],
   *   [4],
   *   [5, 5, 5],
   * ]);
   * ```
   */
  groupBy(predicate: (a: T, b: T) => boolean): IteratorPlus<T[]>;

  /**
   * Determines whether there are no elements in `this`. Consumes the first
   * element, if any.
   *
   * @example
   *
   * ```ts
   * expect(iter([]).isEmpty()).toBe(true);
   * expect(iter([1]).isEmpty()).toBe(false);
   *
   * function* empty() {}
   * expect(iter(empty()).isEmpty()).toBe(true);
   * ```
   */
  isEmpty(): boolean;

  /**
   * Returns a string representation of `this` by joining elements with
   * `separator`. Consumes the entire contained iterable.
   */
  join(separator?: string): string;

  /**
   * Returns the last element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([10, 40, 30]).last()).toEqual(30);
   * expect(iter([]).last()).toBeUndefined();
   * ```
   */
  last(): T | undefined;

  /**
   * Yields elements from `this` after applying `fn`.
   *
   * @example
   *
   * ```ts
   * const input = [1, 2, 3, 4, 5];
   * const output = iter(input).map((n) => n * 2);
   * expect(output.toArray()).toEqual([2, 4, 6, 8, 10]);
   * ```
   */
  map<U>(fn: (value: T, index: number) => U): IteratorPlus<U>;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([10, 40, 30]).max()).toEqual(40);
   * expect(iter([]).max()).toBeUndefined();
   * ```
   */
  max(this: IteratorPlus<number>): T | undefined;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter(['a', 'bb', 'ccc']).max((a, b) => a.length - b.length)
   * ).toEqual('ccc');
   * ```
   */
  max(compareFn: (a: T, b: T) => number): T | undefined;

  /**
   * Returns the element of `this` whose return value from `fn` is the maximum.
   * Returns `undefined` if `this` is empty. Comparison happens using `>` on the
   * return values of `fn`. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter(['a', 'bb', 'ccc']).maxBy((s) => s.length)
   * ).toEqual('ccc');
   */
  maxBy(fn: (item: T) => number): T | undefined;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([10, 40, 30]).min()).toEqual(10);
   * expect(iter([]).min()).toBeUndefined();
   * ```
   */
  min(this: IteratorPlus<number>): T | undefined;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter(['a', 'bb', 'ccc']).min((a, b) => a.length - b.length)
   * ).toEqual('a');
   * ```
   */
  min(compareFn: (a: T, b: T) => number): T | undefined;

  /**
   * Returns the element of `this` whose return value from `fn` is the minimum.
   * Returns `undefined` if `this` is empty. Comparison happens using `<` on the
   * return values of `fn`. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(
   *   iter(['a', 'bb', 'ccc']).minBy((s) => s.length)
   * ).toEqual('a');
   * ```
   */
  minBy(fn: (item: T) => number): T | undefined;

  /**
   * Partitions elements into two groups. Elements that satisfy `predicate` are
   * placed in the first group, and the rest are placed in the second group.
   * Consumes the entire contained iterable. Element order is preserved.
   *
   * @example
   *
   * ```ts
   * const input = [1, 1, 2, 3, 3, 4, 5, 5, 5];
   * const [evens, odds] = iter(input).partition((n) => n % 2 === 0);
   * expect(evens).toEqual([2, 4]);
   * expect(odds).toEqual([1, 1, 3, 3, 5, 5, 5]);
   * ```
   */
  partition(predicate: (item: T) => unknown): [truthy: T[], falsy: T[]];

  /**
   * Reduces elements from `this` using `fn`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * expect(naturals().take(0).reduce((acc, n) => acc * n)).toBeUndefined();
   * expect(naturals().take(10).reduce((acc, n) => acc * n)).toEqual(3_628_800);
   * ```
   */
  reduce(fn: (accumulator: T, value: T, index: number) => T): Optional<T>;

  /**
   * Reduces elements from `this` using `fn` starting with a provided initial
   * value. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(naturals().take(10).reduce((acc, n) => acc * n, 1)).toEqual(3_628_800);
   * ```
   */
  reduce<U>(
    fn: (accumulator: U, value: T, index: number) => U,
    initialValue: U
  ): U;

  /**
   * Yields elements in reverse order. Consumes the entire contained iterable.
   *
   * **Caution:** this method consumes and stores the entire iterable before
   * yielding any elements.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).rev().toArray()).toEqual([3, 2, 1]);
   * ```
   */
  rev(): IteratorPlus<T>;

  /**
   * Ignore the first `count` values.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).skip(2).toArray()).toEqual([3, 4, 5]);
   * ```
   */
  skip(count: number): IteratorPlus<T>;

  /**
   * Determines whether any element satisfies `predicate`. Consumes the
   * contained iterable until a matching element is found.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).some((n) => n % 2 === 0)).toBe(true);
   * expect(iter([1, 2, 3, 4, 5]).some((n) => n > 5)).toBe(false);
   * ```
   */
  some(predicate: (item: T) => unknown): boolean;

  /**
   * Sums elements from `this`. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).sum()).toEqual(15);
   * ```
   */
  sum(this: IteratorPlus<number>): T;

  /**
   * Sums elements from `this` using `fn` to transform each element. Consumes
   * the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).sum((n) => n * 2)).toEqual(30);
   * ```
   */
  sum(fn: (item: T) => number): number;

  /**
   * Takes up to the first `count` elements.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).take(2).toArray()).toEqual([1, 2]);
   * ```
   */
  take(count: number): IteratorPlus<T>;

  /**
   * Collects all elements from `this` into an array. Consumes the entire
   * contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3, 4, 5]).toArray()).toEqual([1, 2, 3, 4, 5]);
   * ```
   */
  toArray(): T[];

  /**
   * Groups elements from `this` by applying `keySelector` to each element.
   * Consumes entire the contained iterable.
   *
   * @example
   *
   * ```ts
   * const input = [
   *   { name: 'Alice', age: 21 },
   *   { name: 'Bob', age: 21 },
   *   { name: 'Charlie', age: 22 },
   *   { name: 'Dave', age: 22 },
   *   { name: 'Eve', age: 21 },
   * ];
   * const groups = iter(input).toMap((person) => person.age);
   * expect(groups.get(21)).toEqual(new Set([
   *   { name: 'Alice', age: 21 },
   *   { name: 'Bob', age: 21 },
   *   { name: 'Eve', age: 21 },
   * ]));
   * ```
   */
  toMap<K>(keySelector: (item: T) => K): Map<K, Set<T>>;

  /**
   * Collects all elements from `this` into a set. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 1, 3, 2]).toSet()).toEqual(new Set([1, 2, 3]));
   * ```
   */
  toSet(): Set<T>;

  /**
   * Alias for {@link join}.
   */
  toString(separator?: string): string;

  /**
   * Throws an error because `groupSize` must be greater than 0.
   */
  windows(groupSize: 0): never;

  /**
   * Yields elements from `this` as 1-element tuples.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).windows(1).toArray()).toEqual([[1], [2], [3]]);
   * ```
   */
  windows(groupSize: 1): IteratorPlus<[T]>;

  /**
   * Yields tuples of two elements at a time.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).windows(2).toArray()).toEqual([[1, 2], [2, 3]]);
   * ```
   */
  windows(groupSize: 2): IteratorPlus<[T, T]>;

  /**
   * Yields tuples of three elements at a time.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).windows(3).toArray()).toEqual([[1, 2, 3]]);
   * expect(iter([1, 2, 3, 4]).windows(3).toArray()).toEqual([[1, 2, 3], [2, 3, 4]]);
   * ```
   */
  windows(groupSize: 3): IteratorPlus<[T, T, T]>;

  /**
   * Yields tuples of four elements at a time.
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).windows(4).toArray()).toEqual([]);
   * expect(
   *   naturals()
   *     .windows(4)
   *     .take(2)
   *     .toArray()
   * ).toEqual([
   *   [1, 2, 3, 4],
   *   [2, 3, 4, 5]
   * ]);
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
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).zip(['a', 'b', 'c']).toArray()).toEqual([
   *   [1, 'a'],
   *   [2, 'b'],
   *   [3, 'c'],
   * ]);
   * ```
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
   *
   * @example
   *
   * ```ts
   * expect(iter([1, 2, 3]).zipMin(['a', 'b']).toArray()).toEqual([
   *   [1, 'a'],
   *   [2, 'b'],
   * ]);
   * ```
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
   *
   * @example
   *
   * ```ts
   * // simple version of `cat` for line-oriented files
   * const file1 = fs.createReadStream('file1.txt', { encoding: 'utf8' });
   * const file2 = fs.createReadStream('file2.txt', { encoding: 'utf8' });
   * const concatenated = lines(file1).chain(lines(file2));
   * ```
   */
  chain<U>(other: AsyncIterable<U>): AsyncIteratorPlus<T | U>;

  /**
   * Yields tuples of one element at a time.
   */
  chunks(groupSize: 1): AsyncIteratorPlus<[T]>;

  /**
   * Yields 2-element tuples, plus a 1-element tuple if there is a final
   * element.
   *
   * @example
   *
   * ```ts
   * const linePairs = lines(process.stdin).chunks(2);
   * for await (const [first, second] of linePairs) {
   *   …
   * }
   * ```
   */
  chunks(groupSize: 2): AsyncIteratorPlus<[T] | [T, T]>;

  /**
   * Yields 3-element tuples, plus a 1- or 2-element tuple if there are
   * remaining elements.
   */
  chunks(groupSize: 3): AsyncIteratorPlus<[T] | [T, T] | [T, T, T]>;

  /**
   * Yields 4-element tuples, plus a 1-3-element tuple if there are remaining
   * elements.
   */
  chunks(
    groupSize: 4
  ): AsyncIteratorPlus<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;

  /**
   * Yields arrays of {@link groupSize} elements, plus a smaller array if there
   * are remaining elements.
   */
  chunks(groupSize: number): AsyncIteratorPlus<T[]>;

  /**
   * Counts the number of elements in `this`. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * // simple version of `wc -l`
   * const file = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const lineCount = await lines(file).count();
   * console.log(lineCount);
   * ```
   */
  count(): Promise<number>;

  /**
   * Cycles elements from `this` indefinitely.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * for await (const line of lines(input).cycle().take(100)) {
   *   …
   * }
   * ```
   */
  cycle(): AsyncIteratorPlus<T>;

  /**
   * Enumerates elements along with their index.
   *
   * @example
   *
   * ```ts
   * // iterate over a file and print line numbers
   * const file = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * for await (const [index, line] of lines(file).enumerate()) {
   *   console.log(`${index + 1}: ${line}`);
   * }
   * ```
   */
  enumerate(): AsyncIteratorPlus<[number, T]>;

  /**
   * Determines if all elements satisfy `predicate`. Consumes the contained
   * iterable until a non-matching element is found.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const allLinesAreBlank = await lines(input).every((line) => line === '');
   * ```
   */
  every(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean>;

  /**
   * Filters elements from `iterable` by applying `predicate` to each element.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const nonBlankLines = lines(input).filter((line) => line !== '');
   * ```
   */
  filter(fn: (value: T) => MaybePromise<unknown>): AsyncIteratorPlus<T>;

  /**
   * Filters and maps elements from `iterable` by applying `fn` to each element,
   * treating nullish return values as elements to be filtered out.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('.env', { encoding: 'utf8' });
   * const envLines = lines(input)
   *   // This could be separate `.filter` and `.map` calls, but we want to log
   *   // errors with the right line number.
   *   .filterMap((line, index) => {
   *     const parsed = parseLine(line);
   *     if (parsed.isErr()) {
   *       console.error(`error parsing line ${index + 1}:`, parsed.err());
   *       return null;
   *     }
   *     return parsed.ok();
   *   })
   *   .toArray();
   * ```
   */
  filterMap<U extends NonNullable<unknown>>(
    fn: (value: T, index: number) => MaybePromise<U | null | undefined>
  ): AsyncIteratorPlus<U>;

  /**
   * Finds an element that satisfies `predicate`. Consumes the contained
   * iterable until a matching element is found.
   *
   * @example
   *
   * ```ts
   * const movie = fs.createReadStream('ferris-bueller.txt', { encoding: 'utf8' });
   * const allLines = lines(input).lines();
   * expect(
   *   await allLines.find((line) => line.includes('Bueller'))
   * ).toEqual('Bueller? Bueller?');
   * ```
   */
  find(predicate: (item: T) => MaybePromise<unknown>): Promise<T | undefined>;

  /**
   * Returns the first element of `this` or `undefined` if `this` is empty.
   *
   * @example
   *
   * ```ts
   * const pages = pdfAsPages(fs.createReadStream('book.pdf'));
   * expect(await pages.first()).toEqual(expect.objectContaining({ pageNumber: 1 }));
   * ```
   */
  first(): Promise<T | undefined>;

  /**
   * Maps elements to an async iterable of `U` and flattens the result.
   *
   * @example
   *
   * ```ts
   * const input = getAsyncLinesIteratorSomehow();
   * const words = input.flatMap((line) => line.split(/\s+/));
   *
   * for await (const word of words) {
   *   …
   * }
   * ```
   */
  flatMap<U>(
    fn: (
      value: T,
      index: number
    ) => MaybePromise<Iterable<U> | AsyncIterable<U>>
  ): AsyncIteratorPlus<U>;

  /**
   * Returns an iterator that produces non-overlapping runs of elements from
   * `this` using `predicate` to separate runs.
   *
   * @example
   *
   * ```ts
   * const input = promptUserForNumbers();
   * const groups = iter(input).groupBy((a, b) => a === b);
   *
   * // user types 1↩️ 1↩️ 2↩️ 3↩️ 3↩️ 4↩️ 5↩️ 5↩️ 5↩️ ↩ ️
   * expect(await groups.toArray()).toEqual([
   *   [1, 1],
   *   [2],
   *   [3, 3],
   *   [4],
   *   [5, 5, 5],
   * ]);
   * ```
   */
  groupBy(
    predicate: (a: T, b: T) => MaybePromise<boolean>
  ): AsyncIteratorPlus<T[]>;

  /**
   * Determines whether there are no elements in `this`. Consumes the first
   * element, if any.
   *
   * @example
   *
   * ```ts
   * expect(await iter([]).async().isEmpty()).toBe(true);
   * expect(await iter([1]).async().isEmpty()).toBe(false);
   *
   * async function* empty() {}
   * expect(await iter(empty()).isEmpty()).toBe(true);
   * ```
   */
  isEmpty(): Promise<boolean>;

  /**
   * Returns a string representation of `this` by joining elements with
   * `separator`. Consumes the entire contained iterable.
   */
  join(separator?: string): Promise<string>;

  /**
   * Returns the last element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * const movie = fs.createReadStream('ferris-bueller.txt', { encoding: 'utf8' });
   * expect(lines(movie).last()).toEqual('You\'re still here? It\'s over. Go home. Go.');
   * ```
   */
  last(): Promise<T | undefined>;

  /**
   * Yields elements from `this` after applying `fn`.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const output = fs.createWriteStream('file-with-line-numbers.txt', { encoding: 'utf8' });
   *
   * Readable.from(
   *   lines(input).map((line, index) => `${index + 1}: ${line}\n`)
   * ).pipe(output);
   * ```
   */
  map<U>(
    fn: (value: T, index: number) => MaybePromise<U>
  ): AsyncIteratorPlus<U>;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * const maximumLineLength = await lines(process.stdin)
   *   .map((line) => line.length)
   *   .max();
   * ```
   */
  max(this: AsyncIteratorPlus<number>): Promise<T | undefined>;

  /**
   * Returns the maximum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * const maximumLineLength = await lines(process.stdin)
   *   .max((line1, line2) => line1.length - line2.length);
   * ```
   */
  max(compareFn: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Returns the element of `this` whose return value from `fn` is the maximum.
   * Returns `undefined` if `this` is empty. Comparison happens using `>` on the
   * return values of `fn`. Consumes the entire contained iterable.
   */
  maxBy(fn: (item: T) => MaybePromise<number>): Promise<T | undefined>;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * expect(await iter([10, 40, 30]).async().min()).toEqual(10);
   * expect(await iter([]).async().min()).toBeUndefined();
   * ```
   */
  min(this: AsyncIteratorPlus<number>): Promise<T | undefined>;

  /**
   * Returns the minimum element of `this` or `undefined` if `this` is empty.
   * Comparison happens using `compareFn`. Consumes the entire contained iterable.
   */
  min(compareFn: (a: T, b: T) => MaybePromise<number>): Promise<T | undefined>;

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
  partition(
    predicate: (item: T) => unknown
  ): Promise<[truthy: T[], falsy: T[]]>;

  /**
   * Reduces elements from `this` using `fn`. Consumes the entire contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('numbers.txt', { encoding: 'utf8' });
   * const product = await lines(input)
   *   .map(parseInt)
   *   .reduce((acc, n) => acc * n);
   * ```
   */
  reduce(
    fn: (accumulator: T, value: T, index: number) => MaybePromise<T>
  ): Promise<Optional<T>>;

  /**
   * Reduces elements from `this` using `fn` starting with a provided initial
   * value. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('numbers.txt', { encoding: 'utf8' });
   * const product = await lines(input)
   *   .map(parseInt)
   *   .reduce((acc, n) => acc * n, 1);
   * ```
   */
  reduce<U>(
    fn: (accumulator: U, value: T, index: number) => MaybePromise<U>,
    initialValue: U
  ): Promise<U>;

  /**
   * Yields elements in reverse order. Consumes the entire contained iterable.
   *
   * **Caution:** this method consumes and stores the entire iterable before
   * yielding any elements.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const output = fs.createWriteStream('file-reversed.txt', { encoding: 'utf8' });
   * Readable.from(lines(input).rev().map((line) => `${line}\n`)).pipe(output);
   * ```
   */
  rev(): AsyncIteratorPlus<T>;

  /**
   * Ignore the first `count` values from the given iterable.
   *
   * @example
   *
   * ```ts
   * // simple version of `tail -n +2`
   * const input = lines(process.stdin);
   * Readable.from(input.skip(1).map((line) => `${line}\n`)).pipe(process.stdout);
   * ```
   */
  skip(count: number): AsyncIteratorPlus<T>;

  /**
   * Determines whether any element satisfies `predicate`. Consumes the
   * contained iterable until a matching element is found.
   *
   * @example
   *
   * ```ts
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const hasSpiderMan = await lines(input).some((line) => line.includes('Spider-Man'));
   * ```
   */
  some(predicate: (item: T) => MaybePromise<unknown>): Promise<boolean>;

  /**
   * Sums elements from `this`. Consumes the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * // add all the numbers from stdin
   * const input = lines(process.stdin);
   * const sum = await input.filterMap(
   *   (line) => safeParseInt(line).ok()
   * ).sum();
   * ```
   */
  sum(this: AsyncIteratorPlus<number>): Promise<T>;

  /**
   * Sums elements from `this` using `fn` to transform each element. Consumes
   * the entire contained iterable.
   *
   * @example
   *
   * ```ts
   * // add all the numbers from stdin
   * const input = lines(process.stdin);
   * const sum = await input.sum((line) => safeParseInt(line).ok() ?? 0);
   * ```
   */
  sum(fn: (item: T) => MaybePromise<number>): Promise<T>;

  /**
   * Takes up to the first `count` elements from `iterable`.
   *
   * @example
   *
   * ```ts
   * // simple version of `head -n 2`
   * const input = lines(process.stdin);
   * Readable.from(input.take(2).map((line) => `${line}\n`)).pipe(process.stdout);
   * ```
   */
  take(count: number): AsyncIteratorPlus<T>;

  /**
   * Collects all elements from `this` into an array. Consumes the contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * // mostly equivalent to `fs.readFileSync('file.txt', { encoding: 'utf8' }).split('\n')`
   * const input = fs.createReadStream('file.txt', { encoding: 'utf8' });
   * const allLines = await lines(input).toArray();
   * ```
   */
  toArray(): Promise<T[]>;

  /**
   * Groups elements from `this` by applying `keySelector` to each element and
   * consumes the contained iterable.
   *
   * @example
   *
   * ```ts
   * const stdinByFirstLetter = await lines(process.stdin).toMap((line) => line[0]);
   * ```
   */
  toMap<K>(keySelector: (item: T) => MaybePromise<K>): Promise<Map<K, Set<T>>>;

  /**
   * Collects all elements from `this` into a set. Consumes the contained
   * iterable.
   *
   * @example
   *
   * ```ts
   * const uniqueWords = await lines(process.stdin)
   *   .flatMap((line) => line.split(/\s+/))
   *   .toSet();
   * ```
   */
  toSet(): Promise<Set<T>>;

  /**
   * Alias for {@link join}.
   */
  toString(separator?: string): Promise<string>;

  /**
   * Throws an error because `groupSize` must be greater than 0.
   */
  windows(groupSize: 0): never;

  /**
   * Yields elements from `this` as 1-element tuples.
   *
   * @example
   *
   * ```ts
   * const linesAsTuples = await lines(process.stdin).windows(1).toArray();
   * ```
   */
  windows(groupSize: 1): AsyncIteratorPlus<[T]>;

  /**
   * Yields tuples of two elements at a time.
   *
   * @example
   *
   * ```ts
   * // find pairs of consecutive lines that are the same
   * const pairsOfLinesAndLineNumbers = lines(process.stdin)
   *   .enumerate()
   *   .windows(2);
   * for await (const [
   *   [line, lineno],
   *   [nextLine, nextLineno]
   * ] of pairsOfLinesAndLineNumbers) {
   *   if (line === nextLine) {
   *     console.log(`lines ${lineno} and ${nextLineno} are the same`);
   *   }
   * }
   * ```
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
   *
   * @example
   *
   * ```ts
   * // join the first 10 lines from two files
   * const file1 = fs.createReadStream('file1.txt', { encoding: 'utf8' });
   * const file2 = fs.createReadStream('file2.txt', { encoding: 'utf8' });
   * const lines1 = lines(file1).take(10);
   * const lines2 = lines(file2).take(10);
   * const joinedLines = lines1.zip(lines2).map(([line1, line2]) => `${line1} ${line2}`);
   * ```
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
   *
   * @example
   *
   * ```ts
   * // join all lines from two files until one runs out
   * const file1 = fs.createReadStream('file1.txt', { encoding: 'utf8' });
   * const file2 = fs.createReadStream('file2.txt', { encoding: 'utf8' });
   * const joinedLines = lines(file1).zipMin(lines(file2)).map(([line1, line2]) => `${line1} ${line2}`);
   * ```
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
