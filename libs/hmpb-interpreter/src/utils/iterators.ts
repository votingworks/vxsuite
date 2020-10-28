import { inspect } from 'util'

export function zip(): Generator<[]>
export function zip<T>(one: Iterable<T>): Generator<[T]>
export function zip<T, U>(one: Iterable<T>, two: Iterable<U>): Generator<[T, U]>
export function zip<T, U, V>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>
): Generator<[T, U, V]>
export function zip<T, U, V, W>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>
): Generator<[T, U, V, W]>
export function zip<T, U, V, W, X>(
  one: Iterable<T>,
  two: Iterable<U>,
  three: Iterable<V>,
  four: Iterable<W>,
  five: Iterable<X>
): Generator<[T, U, V, W, X]>
export function* zip(...iterables: Iterable<unknown>[]): Generator<unknown[]> {
  const iterators = iterables.map((iterable) => iterable[Symbol.iterator]())

  while (true) {
    const nexts = iterators.map((iterator) => iterator.next())
    const dones = nexts.filter(({ done }) => done)

    if (dones.length === nexts.length) {
      break
    } else if (dones.length > 0) {
      throw new Error(
        `not all iterables are the same length: ${nexts
          .map(({ value }) => inspect(value))
          .join(', ')}`
      )
    }

    yield nexts.map(({ value }) => value)
  }
}

export function* zipMin<T, U>(
  left: Iterable<T>,
  right: Iterable<U>
): Generator<[T, U]> {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()

  while (true) {
    const leftNext = leftIterator.next()
    const rightNext = rightIterator.next()

    if (leftNext.done || rightNext.done) {
      break
    }

    yield [leftNext.value, rightNext.value]
  }
}

export function* reversed<T>(collection: Iterable<T>): Generator<T> {
  const elements = [...collection]

  for (let i = elements.length - 1; i >= 0; i -= 1) {
    yield elements[i]
  }
}

export function* map<T, U>(
  collection: Iterable<T>,
  mapfn: (element: T, index: number) => U
): Generator<U> {
  let index = 0
  for (const element of collection) {
    yield mapfn(element, index)
    index += 1
  }
}
