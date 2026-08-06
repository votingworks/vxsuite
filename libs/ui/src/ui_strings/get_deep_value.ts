/**
 * Returns the value at the given i18next-style dot-separated key path within
 * the given object, or `undefined` if the path doesn't exist.
 */
export function getDeepValue(object: unknown, keyPath: string): unknown {
  let value: unknown = object;
  for (const key of keyPath.split('.')) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
