// Driver: greet('hi', '?'), makeConfig({ retries: 2 }), pluralize(1).

// An inline directive in a default-parameter initializer.
export function greet(
  name: string,
  punctuation = /* @coverage-exclude: default punctuation */ '!'
): string {
  return `${name}${punctuation}`;
}

// @coverage-defer: see makeConfig
function defaultRetries(): number {
  return 3;
}

// An inline directive on the ?? arm of an object property value.
export function makeConfig(overrides: { retries?: number }): {
  retries: number;
} {
  return {
    retries:
      overrides.retries ?? /* @coverage-defer: default plumbing untested */ defaultRetries(),
  };
}

// An inline directive on a ternary arm inside a template-literal span.
export function pluralize(count: number): string {
  return `${count} item${count === 1 ? '' : /* @coverage-exclude: plural suffix */ 's'}`;
}
