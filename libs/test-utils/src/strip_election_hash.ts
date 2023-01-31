/**
 * Stand in for any plain object. There are some type issues to use this as the
 * types for {@link stripElectionHash}, but we coerce to it within the helper.
 */
type PlainObject = Record<string | number | symbol, unknown>;

/**
 * Takes a plain object and returns the same object with the key `electionHash`
 * replaced by `expect.anything()`. Useful for preprocessing objects for snapshots
 * that have an `electionHash` key that would change every time the election
 * definition changes. Operates recursively on the object.
 */
export function stripElectionHash(entity: unknown[]): unknown[];
export function stripElectionHash(entity: unknown): unknown;
export function stripElectionHash(
  entity: unknown[] | unknown
): unknown[] | unknown {
  if (Array.isArray(entity)) {
    return entity.map((child) => stripElectionHash(child));
  }

  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  const newObject: PlainObject = {};

  for (const [key, value] of Object.entries(entity as PlainObject)) {
    if (key === 'electionHash') {
      newObject[key] = expect.anything();
    } else if (Array.isArray(value)) {
      newObject[key] = stripElectionHash(value);
    } else if (
      value &&
      typeof value === 'object' &&
      value.constructor === Object
    ) {
      newObject[key] = stripElectionHash(value);
    } else {
      newObject[key] = value;
    }
  }
  return newObject;
}
