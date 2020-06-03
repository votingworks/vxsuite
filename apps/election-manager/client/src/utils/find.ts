/**
 * Finds an element in `array` that matches `predicate`, optionally returning
 * `defaultValue` if no element matches.
 *
 * @throws when no element matches and no default value is provided
 */
function find<T>(array: T[], predicate: (element: T) => boolean): T
function find<T>(
  array: T[],
  predicate: (element: T) => boolean,
  defaultValue: T
): T
function find<T>(
  array: T[],
  predicate: (element: T) => boolean,
  defaultValue?: T
): T {
  const result = array.find(predicate)

  if (result === undefined) {
    if (defaultValue === undefined) {
      throw new Error('unable to find an element matching a predicate')
    }

    return defaultValue
  }

  return result
}

export default find
