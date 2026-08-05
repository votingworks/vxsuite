// Driver: new Partial().used(), new Config().
// Locks: declaration binding includes the body (function, class, method,
// class field with arrow initializer).

// @coverage-exclude: dev-only helper, never called from tests
export function debugDump(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.toUpperCase();
}

// @coverage-defer: widget rendering not yet tested
export class Widget {
  label = 'widget';

  render(): string {
    return this.label;
  }
}

export class Partial {
  // @coverage-exclude: error-path formatting only
  describe(): string {
    return 'partial';
  }

  used(): number {
    return 7;
  }
}

export class Config {
  // @coverage-exclude: lazily evaluated default thunk
  fallback = (): string => 'default';

  name = 'config';
}
