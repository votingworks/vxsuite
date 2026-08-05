// Driver: beforeReturn(), elseMisuse(true), elseMisuse(false) — everything
// covered; the failures here are flag errors, not coverage.
// Locks: orphan detection (end of block, end of file) and -else misuse on an
// if that has an explicit else.

export function beforeReturn(): number {
  const value = 41;
  return value + 1;
  // @coverage-defer: nothing bindable follows inside this block
}

export function elseMisuse(flag: boolean): number {
  // @coverage-exclude-else: misuse — this if has an explicit else
  if (flag) {
    return 1;
  } else {
    return 2;
  }
}

// @coverage-exclude: trailing orphan at end of file
