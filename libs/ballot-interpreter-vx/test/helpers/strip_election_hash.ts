// stand in for any object
type PlainObject = Record<string | number | symbol, unknown>;

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
