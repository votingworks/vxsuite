import { AsyncIteratorPlusImpl } from './async_iterator_plus';
import { IteratorPlusImpl } from './iterator_plus';
import { AsyncIteratorPlus, IteratorPlus } from './types';

/**
 * Builds an {@link IteratorPlus} from an iterable.
 */
export function iter<T>(iterable: Iterable<T>): IteratorPlus<T>;

/**
 * Builds an {@link AsyncIteratorPlus} from an async iterable.
 */
export function iter<T>(iterable: AsyncIterable<T>): AsyncIteratorPlus<T>;

/**
 * Builds an {@link IteratorPlus} or {@link AsyncIteratorPlus} from an iterable.
 */
export function iter<T>(
  iterable: Iterable<T> | AsyncIterable<T>
): IteratorPlus<T> | AsyncIteratorPlus<T> {
  if (typeof iterable === 'string' || Symbol.iterator in iterable) {
    return new IteratorPlusImpl(iterable as Iterable<T>);
  }

  if (Symbol.asyncIterator in iterable) {
    return new AsyncIteratorPlusImpl(iterable as AsyncIterable<T>);
  }

  throw new Error('iterable is not iterable');
}
