// Driver: new Partial().used(), new Config().

// A directive on a function declaration binds the whole body.
// @coverage-exclude: dev-only helper, never called from tests
export function debugDump(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.toUpperCase();
}

// A directive on a class declaration binds every member.
// @coverage-defer: widget rendering not yet tested
export class Widget {
  label = 'widget';

  render(): string {
    return this.label;
  }
}

export class Partial {
  // A directive on a method binds just that method. used() stays checked.
  // @coverage-exclude: error-path formatting only
  describe(): string {
    return 'partial';
  }

  used(): number {
    return 7;
  }
}

export class Config {
  // A directive on a class field binds its arrow-function initializer.
  // @coverage-exclude: lazily evaluated default thunk
  fallback = (): string => 'default';

  name = 'config';
}
