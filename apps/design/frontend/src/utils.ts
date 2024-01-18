import { assert } from '@votingworks/basics';
import type { Precinct, PrecinctWithSplits } from '@votingworks/design-backend';
import { customAlphabet } from 'nanoid';

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}

/**
 * Returns a copy of the given array with the value at the specified index
 * replaced with the given value.
 */
export function replaceAtIndex<T>(
  array: readonly T[],
  index: number,
  newValue: T
): T[] {
  return array.map((value, i) => (i === index ? newValue : value));
}

/**
 * Downloads a file given a file path
 */
export function downloadFile(filePath: string): void {
  const element = document.createElement('a');
  element.setAttribute('href', filePath);
  element.setAttribute('download', '');
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * Returns a copy of the given array with the element at fromIndex
 * moved to toIndex.
 */
export function reorderElement<T>(
  array: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  assert(fromIndex >= 0 && fromIndex < array.length);
  assert(toIndex >= 0 && toIndex < array.length);
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
