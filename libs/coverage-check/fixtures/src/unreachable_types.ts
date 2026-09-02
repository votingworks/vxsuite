// Driver: guard(1), closure('a'), blockDefault('a'), kinds({ kind: 'a' }),
// redundantDirective('a'), defeated('zzz' as unknown as 'a') (catching the
// throw); declared() is never called.
//
// The unreachable-by-type rule: an uncovered statement is excused only when it
// holds a value reference narrowed to `never`.

function fail(message: string): never {
  throw new Error(message);
}

function assertNever(value: never): never {
  throw new Error(`unexpected: ${String(value)}`);
}

// A never-returning call on a reachable error path is not excused: `fail` is
// uncovered here and needs a test or a directive.
export function guard(x: number): number {
  if (x < 0) {
    fail('negative');
  }
  return x;
}

// A never-typed variable's declaration is not excused; the later use of it is.
export function declared(): void {
  const impossible: never = undefined as never;
  void impossible;
}

// A reference inside a nested closure counts for the closure's statement, not
// the enclosing one.
export function closure(k: 'a' | 'b'): number {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default: {
      const cb = () => assertNever(k);
      return cb();
    }
  }
}

// An excused statement excuses its enclosing `default` arm, including the
// block-wrapped `default: { ... }` form.
export function blockDefault(k: 'a' | 'b'): number {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default: {
      assertNever(k);
    }
  }
}

interface A {
  kind: 'a';
}
interface B {
  kind: 'b';
}

// `switch (x.kind)` excuses the default arm because `x` itself is `never`
// there, even though `x.kind` is the switched expression.
export function kinds(x: A | B): number {
  switch (x.kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default:
      return assertNever(x);
  }
}

// Unreachability takes precedence over a directive, which then goes stale.
export function redundantDirective(k: 'a' | 'b'): number {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    // @coverage-defer: unreachable anyway, so this is stale
    default:
      return assertNever(k);
  }
}

// An executed never-reference site is simply covered — the type rule excuses
// only uncovered code. The driver forces the impossible value through.
export function defeated(k: 'a' | 'b'): number {
  switch (k) {
    case 'a':
      return 1;
    case 'b':
      return 2;
    default:
      return assertNever(k);
  }
}
