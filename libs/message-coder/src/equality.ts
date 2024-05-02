import { Coder } from './types';

/**
 * Determines whether two values are equivalent by encoding them and comparing
 * the results.
 */
export function valuesEncodeEquivalently<T>(
  coder: Coder<T>,
  a: T,
  b: T
): boolean {
  const aEncode = coder.encode(a);
  const bEncode = coder.encode(b);
  return (
    !aEncode.isErr() && !bEncode.isErr() && aEncode.ok().equals(bEncode.ok())
  );
}
