/**
 * Finds an element in `array` that matches `predicate`, optionally returning
 * `defaultValue` if no element matches.
 *
 * @throws when no element matches and no default value is provided
 */
export function find<T, S extends T>(
  array: readonly T[],
  predicate: (element: T) => element is S
): S;
export function find<T>(
  array: readonly T[],
  predicate: (element: T) => boolean,
  defaultValue?: T
): T;
export function find<T>(
  array: readonly T[],
  predicate: (element: T) => boolean,
  defaultValue?: T
): T {
  const result = array.find(predicate);
  if (result === undefined) {
    if (defaultValue === undefined) {
      throw new Error('unable to find an element matching a predicate');
    }

    return defaultValue;
  }

  return result;
}
