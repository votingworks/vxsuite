// Driver: ternaryInline(true), nullishInline('x'), nullishOwnLine('x'),
// andGuard(undefined).
// Locks: inline expression-position flags on ternary / ?? / && arms, and the
// own-line ??-arm binding that istanbul attachment verifiably loses today
// (async_iterator_plus.ts:550).

export function ternaryInline(flag: boolean): string {
  return flag ? 'yes' : /* @coverage-exclude: failure label, hardware only */ 'no';
}

export function nullishInline(value: string | undefined): string {
  return value ?? /* @coverage-defer */ 'fallback';
}

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

export function andGuard(n: number | undefined): number {
  return n !== undefined && /* @coverage-exclude */ n > 10
    ? /* @coverage-defer */ 1
    : 0;
}
