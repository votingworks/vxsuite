// Driver: appendIfVerbose(true, 'hi'), orDefault(true), sumNonNegative([-1,
// -2]), requirePositive(-1) (catching the throw), signOf(1), signOf(-1).
//
// Where an `if` with no `else` puts its implicit else arm, and how a directive
// claims it: a NON-terminating then-arm keeps the arm at the `if`, where an
// -else directive claims just the arm (a plain directive would claim the whole
// if); a terminating then-arm moves it to the first statement after the if.

export function appendIfVerbose(verbose: boolean, message: string): string {
  let out = 'log:';
  // The then-arm falls through, so the arm stays at the `if`; an -else
  // directive claims the arm without also claiming the `if` itself.
  // @coverage-exclude-else: quiet path exercised in integration tests
  if (verbose) {
    out += message;
  }
  // @coverage-exclude: trailing newline is a display concern
  if (out.length > 40) out += '\n';
  return out;
}

// The same non-terminating shape without a directive is reported at the `if`.
export function orDefault(flag: boolean): number {
  let value = 0;
  if (flag) {
    value = 1;
  }
  return value + 1;
}

// A terminating (continue) then-arm moves the implicit else to the first
// statement after the if, so that statement's directive claims the arm with
// no separate -else directive.
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

// The throw variant of a terminating then-arm.
export function requirePositive(n: number): number {
  if (n <= 0) {
    throw new Error('not positive');
  }
  // @coverage-exclude: happy path covered by integration tests only
  return n;
}

// For an `else if` chain, the implicit else moves past the whole chain.
export function signOf(n: number): number {
  if (n > 0) {
    return 1;
  } else if (n < 0) {
    return -1;
  }
  // @coverage-defer: zero path untested; also claims the chain's implicit else
  return 0;
}
