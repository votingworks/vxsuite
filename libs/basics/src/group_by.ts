import { deepEqual } from './equality';

/**
 * Groups items by a key function. Uses deepEqual to compare keys in order to
 * support complex key types. For simpler key types, a Map would suffice.
 */
export function groupBy<T, K>(
  items: T[],
  keyFn: (item: T) => K
): Array<[K, T[]]> {
  const groups: Array<[K, T[]]> = [];
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.find(([k]) => deepEqual(k, key));
    if (group) {
      group[1].push(item);
    } else {
      groups.push([key, [item]]);
    }
  }
  return groups;
}
