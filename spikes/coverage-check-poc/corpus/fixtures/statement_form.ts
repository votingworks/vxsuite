// Driver: positiveOnly(3), unflaggedDebt(2), staleFlag(1), unknownLabel(1),
// proseMention(1).
// Locks: own-line directives binding statements; terminating-then
// implicit-else attribution onto the fall-through statement's directive;
// uncovered+undirected FAIL; covered+directed stale; unknown labels and
// prose comments without the @ prefix are not directives.

export function positiveOnly(n: number): number {
  if (n > 0) {
    return n * 2;
  }
  // @coverage-defer: negative path untested
  const flipped = n * -2;
  // @coverage-exclude
  return flipped + 1;
}

export function unflaggedDebt(n: number): number {
  if (n > 0) {
    return 1;
  }
  return -1;
}

export function staleFlag(n: number): number {
  // @coverage-exclude: thought unreachable, but the driver covers it
  return n + 1;
}

export function unknownLabel(n: number): number {
  if (n > 0) {
    return n;
  }
  // @coverage-skip: not a recognized label, must be ignored by the checker
  return -n;
}

export function proseMention(n: number): number {
  if (n > 0) {
    return n;
  }
  // coverage-exclude: without the @ prefix this is prose, not a directive
  return -n;
}
