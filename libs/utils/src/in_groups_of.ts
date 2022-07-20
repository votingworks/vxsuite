import { assert } from './assert';

/**
 * Yields tuples of one element at a time from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: 1
): Iterable<[T]>;
/**
 * Yields tuples of one or two elements at a time from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: 2
): Iterable<[T] | [T, T]>;
/**
 * Yields tuples of 1-3 elements from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: 3
): Iterable<[T] | [T, T] | [T, T, T]>;
/**
 * Yields tuples of 1-4 elements from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: 4
): Iterable<[T] | [T, T] | [T, T, T] | [T, T, T, T]>;
/**
 * Yields arrays of {@link groupSize} or fewer elements from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: number
): Iterable<T[]>;
/**
 * Yields arrays of {@link groupSize} or fewer elements from {@link iterable}.
 */
export function inGroupsOf<T>(
  iterable: Iterable<T>,
  groupSize: number
): Iterable<T[]> {
  assert(
    groupSize > 0 && Math.floor(groupSize) === groupSize,
    'groupSize must be an integer greater than 0'
  );
  const iterator: Iterator<T> = iterable[Symbol.iterator]();
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

  return result;
}
