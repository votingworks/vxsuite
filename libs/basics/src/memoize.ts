/**
 * Memoizes a function that takes a single object argument, using a WeakMap to
 * prevent memory leaks.
 */
export function memoizeByObject<K extends object, V>(
  fn: (key: K) => V
): (key: K) => V {
  const cache = new WeakMap<K, V>();
  return (key: K): V => {
    if (!cache.has(key)) {
      cache.set(key, fn(key));
    }
    return cache.get(key) as V;
  };
}
