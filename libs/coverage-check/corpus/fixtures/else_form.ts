// Driver: appendIfVerbose(true, 'hi'), orDefault(true).
// Locks: -else flag binding the implicit-else arm of a NON-terminating then;
// the unflagged version of the same shape FAILs at the if's location.

export function appendIfVerbose(verbose: boolean, message: string): string {
  let out = 'log:';
  // @coverage-exclude-else: quiet path exercised in integration tests
  if (verbose) {
    out += message;
  }
  return out;
}

export function orDefault(flag: boolean): number {
  let value = 0;
  if (flag) {
    value = 1;
  }
  return value + 1;
}
