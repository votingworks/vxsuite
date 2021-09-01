/**
 * Empty case of `zip`, yields nothing.
 */
export function zip(): Generator<[]>
/**
 * Yields elements of `one`, functionally equivalent to using `one` itself.
 */
export function zip<T>(one: Iterable<T>): Generator<[T]>
/**
 * Yields tuples of size 2 with elements from `one` and `two`.
 *
 * @throws if not all iterables are the same length
 */
export function zip<T, U>(one: Iterable<T>, two: Iterable<U>): Generator<[T, U]>
/**
 * Yields tuples of size 3 with elements from `one`, `two`, and `three`.
 *
 * @throws if not all iterables are the same length
 */
export function zip<T, U, V>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>
): Generator<[T, U, V]>
/**
 * Yields tuples of size 4 with elements from `one`, `two`, `three`, and `four`.
 *
 * @throws if not all iterables are the same length
 */
export function zip<T, U, V, W>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>
): Generator<[T, U, V, W]>
/**
 * Yields tuples of size 5 with elements from `one`, `two`, `three`, `four`, and
 * `five`.
 *
 * @throws if not all iterables are the same length
 */
export function zip<T, U, V, W, X>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>,
  five: Iterable<X>
): Generator<[T, U, V, W, X]>
/**
 * Yields tuples of `iterables.length` length from each iterable.
 *
 * @throws if not all iterables are the same length
 */
export function zip(...iterables: Iterable<unknown>[]): Generator<unknown[]>
export function* zip(...iterables: Iterable<unknown>[]): Generator<unknown[]> {
  const iterators = iterables.map((iterable) => iterable[Symbol.iterator]())

  while (true) {
    const nexts = iterators.map((iterator) => iterator.next())
    const dones = nexts.filter(({ done }) => done)

    if (dones.length === nexts.length) {
      break
    } else if (dones.length > 0) {
      throw new Error('not all iterables are the same length')
    }

    yield nexts.map(({ value }) => value)
  }
}

/**
 * Empty case of `zipMin`, yields nothing.
 */
export function zipMin(): Generator<[]>
/**
 * Yields elements of `one`, functionally equivalent to using `one` itself.
 */
export function zipMin<T>(one: Iterable<T>): Generator<[T]>
/**
 * Yields tuples of size 2 with elements from `one` and `two`.
 */
export function zipMin<T, U>(
  one: Iterable<T>,
  two: Iterable<U>
): Generator<[T, U]>
/**
 * Yields tuples of size 3 with elements from `one`, `two`, and `three`.
 */
export function zipMin<T, U, V>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>
): Generator<[T, U, V]>
/**
 * Yields tuples of size 4 with elements from `one`, `two`, `three`, and `four`.
 */
export function zipMin<T, U, V, W>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>
): Generator<[T, U, V, W]>
/**
 * Yields tuples of size 5 with elements from `one`, `two`, `three`, `four`, and
 * `five`.
 */
export function zipMin<T, U, V, W, X>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>,
  five: Iterable<X>
): Generator<[T, U, V, W, X]>
/**
 * Yields tuples of `iterables.length` length from each iterable.
 */
export function zipMin(...iterables: Iterable<unknown>[]): Generator<unknown[]>
export function* zipMin(
  ...iterables: Iterable<unknown>[]
): Generator<unknown[]> {
  const iterators = iterables.map((iterable) => iterable[Symbol.iterator]())

  while (true) {
    const nexts = iterators.map((iterator) => iterator.next())
    const dones = nexts.filter(({ done }) => done)

    if (dones.length === nexts.length) {
      break
    } else if (dones.length > 0) {
      break
    }

    yield nexts.map(({ value }) => value)
  }
}

/**
 * Yields elements from `iterable`, but in reverse order. Consumes all elements
 * upfront, requiring both the time and space to do so.
 */
export function* reversed<T>(iterable: Iterable<T>): Generator<T> {
  const elements = [...iterable]

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    yield elements[i] as T
  }
}

/**
 * Yields elements from `iterable` after applying `mapfn`.
 */
export function* map<T, U>(
  iterable: Iterable<T>,
  mapfn: (element: T, index: number) => U
): Generator<U> {
  let index = 0
  for (const element of iterable) {
    yield mapfn(element, index)
    index += 1
  }
}

/**
 * Takes up to the first `count` elements from `iterable`.
 */
export function take<T>(count: number, iterable: Iterable<T>): T[] {
  const iterator = iterable[Symbol.iterator]()
  const result: T[] = []

  for (let i = 0; i < count; i += 1) {
    const { value, done } = iterator.next()
    if (done) {
      break
    }
    result.push(value)
  }

  return result
}
