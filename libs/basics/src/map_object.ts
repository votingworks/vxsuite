/**
 * Takes a dictionary and returns a dictionary with the same keys but values
 * remapped by a provided function.
 */
export function mapObject<T, U>(
  object: Record<string, T>,
  fn: (from: T) => U
): Record<string, U> {
  const newObject: Record<string, U> = {};

  for (const [key, value] of Object.entries(object)) {
    newObject[key] = fn(value);
  }

  return newObject;
}
