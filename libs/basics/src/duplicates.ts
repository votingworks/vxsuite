import { unique } from './unique.js';

/**
 * Returns an array of duplicate items in the given array.
 */
export function duplicates<T>(array: T[]): T[] {
  return unique(array.filter((item, index) => array.indexOf(item) !== index));
}
