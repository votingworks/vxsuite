/**
 * Maps a function over the values of an object, returning a new object.
 *
 * Example:
 *  mapValues({ a: 1, b: 2 }, (value) => value * 2) // { a: 2, b: 4 }
 */
export function mapValues<T, U>(
  obj: { [key: string]: T },
  fn: (value: T, key: string) => U
): { [key: string]: U } {
  const result: { [key: string]: U } = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = fn(value, key);
  }
  return result;
}
