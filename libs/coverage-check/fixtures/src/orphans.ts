// Driver: beforeReturn(), elseMisuse(true), elseMisuse(false), noIf() —
// everything covered; the failures here are directive errors, not coverage.

export function beforeReturn(): number {
  const value = 41;
  return value + 1;
  // An orphan at the end of a block.
  // @coverage-defer: nothing bindable follows inside this block
}

export function elseMisuse(flag: boolean): number {
  // An -else directive misused on an if that has an explicit else.
  // @coverage-exclude-else: misuse — this if has an explicit else
  if (flag) {
    return 1;
  } else {
    return 2;
  }
}

export function noIf(): number {
  // An -else directive with no if to bind.
  // @coverage-defer-else: no if follows
  return 3;
}

// An orphan at the end of the file.
// @coverage-exclude: trailing orphan at end of file
