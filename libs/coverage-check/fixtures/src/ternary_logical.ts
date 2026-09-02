// Driver: ternaryInline(true), nullishInline('x'), nullishOwnLine('x'),
// andGuard(undefined).

// An inline directive on a ternary arm in expression position.
export function ternaryInline(flag: boolean): string {
  return flag ? 'yes' : /* @coverage-exclude: failure label, hardware only */ 'no';
}

// An inline directive (with no reason) on a ?? arm.
export function nullishInline(value: string | undefined): string {
  return value ?? /* @coverage-defer */ 'fallback';
}

// A line-level directive binding a ?? arm on its own line.
export function nullishOwnLine(value: string | undefined): string {
  return (
    value ??
    // @coverage-exclude: exhausted-iterator fallback
    buildFallback()
  );
}

// @coverage-exclude: see nullishOwnLine
function buildFallback(): string {
  return 'generated';
}

// Inline directives on && and ternary arms in the same expression.
export function andGuard(n: number | undefined): number {
  return n !== undefined && /* @coverage-exclude */ n > 10
    ? /* @coverage-defer */ 1
    : 0;
}
