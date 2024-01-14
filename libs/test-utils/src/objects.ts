function getObjectLeavesHelper(value: unknown): unknown[] {
  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
    return [value];
  }
  return Object.values(value).flatMap(getObjectLeavesHelper);
}

/**
 * Recursively traverses an object and collects all its non-object values, i.e. leaves. See tests
 * for sample inputs and outputs.
 *
 * For the purposes of this function, arrays and null count as non-object values.
 */
export function getObjectLeaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
    return [];
  }
  return Object.values(value).flatMap(getObjectLeavesHelper);
}

/**
 * Recursively traverses an object and counts all its non-object values, i.e. leaves. See tests for
 * sample inputs and outputs.
 *
 * For the purposes of this function, arrays and null count as non-object values.
 */
export function countObjectLeaves(value: unknown): number {
  return getObjectLeaves(value).length;
}
