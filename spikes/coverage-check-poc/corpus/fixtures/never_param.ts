// Driver: handle('alpha'), handle('beta'), handleBlock('alpha'),
// handleBlock('beta'), notExcused('a'), genericNotExcused(1).
// Locks: never-param auto-exclusion — aliased import excused at the call site
// (statement + enclosing default arm, including the block-wrapped
// `default: { ... }` repo convention); a LOCAL function with the same original
// name but a non-never param is NOT excused; generic functions never qualify.

import { identity, throwIllegalValue as assertExhausted } from './never_helpers';

type Kind = 'alpha' | 'beta';

export function handle(kind: Kind): number {
  switch (kind) {
    case 'alpha':
      return 1;
    case 'beta':
      return 2;
    default:
      assertExhausted(kind);
  }
}

export function handleBlock(kind: Kind): number {
  switch (kind) {
    case 'alpha':
      return 10;
    case 'beta':
      return 20;
    default: {
      assertExhausted(kind);
    }
  }
}

function throwIllegalValue(value: string): never {
  throw new Error(value);
}

export function notExcused(x: string): string {
  if (x.length > 0) {
    return x;
  }
  return throwIllegalValue(x);
}

export function genericNotExcused(x: number): number {
  if (x > 0) {
    return x;
  }
  return identity(x);
}
