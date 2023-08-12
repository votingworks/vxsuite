export function intersectArrays<T>(a: T[], b: T[]): T[] {
  return a.filter((x) => b.includes(x));
}

export function intersectArraysIfDefined<T>(a: T[] | undefined, b: T[]): T[] {
  return a ? intersectArrays(a, b) : b;
}
