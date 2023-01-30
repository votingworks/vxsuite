/**
 * Groups the elements of {@link iterable} by the {@link keySelector} function.
 */
export function groupBy<Element, Key>(
  iterable: Iterable<Element>,
  keySelector: (item: Element) => Key
): Map<Key, Set<Element>> {
  const groups = new Map<Key, Set<Element>>();
  for (const item of iterable) {
    const key = keySelector(item);
    let group = groups.get(key);
    if (!group) {
      group = new Set();
      groups.set(key, group);
    }
    group.add(item);
  }
  return groups;
}
