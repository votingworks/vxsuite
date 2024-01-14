function getObjectLeavesHelper(value: unknown): unknown[] {
  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
    return [value];
  }
  return Object.values(value).flatMap(getObjectLeavesHelper);
}

export function getObjectLeaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
    return [];
  }
  return Object.values(value).flatMap(getObjectLeavesHelper);
}

export function countObjectLeaves(value: unknown): number {
  return getObjectLeaves(value).length;
}
