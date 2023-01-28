import { Dictionary } from '@votingworks/types';

/**
 * Stand in for any plain object. There are some type issues to use this as the
 * types for {@link replaceSnapshotValues}, but we coerce to it within the helper.
 */
type PlainObject = Record<string | number | symbol, unknown>;

/**
 * Takes a plain object and returns the same object with the specified key-value
 * pairs replaced. Useful for stripping out values from snapshots that would. Acts
 * recursively on the object. Useful for updating matchers on values that might
 * change often and do not need to be checked exactly.
 *
 * @param entity The object in which to replace values
 * @param replacements A dictionary of keys to replace with their respective values
 */
export function replaceSnapshotValues(
  entity: unknown[],
  replacements: Dictionary<unknown>
): unknown[];
export function replaceSnapshotValues(
  entity: unknown,
  replacements: Dictionary<unknown>
): unknown;
export function replaceSnapshotValues(
  entity: unknown[] | unknown,
  replacements: Dictionary<unknown>
): unknown[] | unknown {
  if (Array.isArray(entity)) {
    return entity.map((child) => replaceSnapshotValues(child, replacements));
  }

  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  const newObject: PlainObject = {};

  for (const [key, value] of Object.entries(entity as PlainObject)) {
    if (Object.keys(replacements).includes(key)) {
      newObject[key] = replacements[key];
    } else if (Array.isArray(value)) {
      newObject[key] = replaceSnapshotValues(value, replacements);
    } else if (
      value &&
      typeof value === 'object' &&
      value.constructor === Object
    ) {
      newObject[key] = replaceSnapshotValues(value, replacements);
    } else {
      newObject[key] = value;
    }
  }
  return newObject;
}
