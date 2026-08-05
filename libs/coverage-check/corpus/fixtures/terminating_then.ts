// Driver: sumNonNegative([-1, -2]), requirePositive(-1) (catching the throw).
// Locks: terminating-then attribution for continue and throw — the implicit-else
// arm is attributed to the first statement after the if, so that statement's
// flag covers the arm with no separate -else flag.

export function sumNonNegative(items: number[]): number {
  let sum = 0;
  for (const item of items) {
    if (item < 0) {
      continue;
    }
    // @coverage-defer: positive accumulation untested
    sum += item;
  }
  return sum;
}

export function requirePositive(n: number): number {
  if (n <= 0) {
    throw new Error('not positive');
  }
  // @coverage-exclude: happy path covered by integration tests only
  return n;
}
