// Driver: positiveOnly(3), wrappedReason(1), unflaggedDebt(2), staleFlag(1),
// unknownLabel(1).

// Simple directives binding to statements.
// Also the defer gets implicit-else attribution from the `if` above it.
export function positiveOnly(n: number): number {
  if (n > 0) {
    return n * 2;
  }
  // @coverage-defer: negative path untested
  const flipped = n * -2;
  // @coverage-exclude
  return flipped + 1;
}

// A block-comment directive whose reason wraps onto a second line.
export function wrappedReason(n: number): number {
  if (n > 0) {
    return n;
  }
  /* @coverage-exclude: the reason for a block-comment directive may wrap
     onto further lines */
  return -n;
}

// Uncovered code without a directive is reported.
export function unflaggedDebt(n: number): number {
  if (n > 0) {
    return 1;
  }
  return -1;
}

// A directive on covered code is stale.
export function staleFlag(n: number): number {
  // @coverage-exclude: thought unreachable, but the driver covers it
  return n + 1;
}

// A comment that starts like a directive but breaks the grammar is a parse
// error, so a typo cannot silently do nothing.
export function unknownLabel(n: number): number {
  if (n > 0) {
    return n;
  }
  // @coverage-skip: not a recognized action, reported as a parse error
  return -n;
}
