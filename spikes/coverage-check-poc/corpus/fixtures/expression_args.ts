// Driver: greet('hi', '?'), makeConfig({ retries: 2 }), pluralize(1).
// Locks: inline flags in default-parameter initializers, object property
// values (?? arm), and template-literal spans (ternary arm).

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

export function makeConfig(overrides: { retries?: number }): {
  retries: number;
} {
  return {
    retries:
      overrides.retries ?? /* @coverage-defer: default plumbing untested */ defaultRetries(),
  };
}

export function pluralize(count: number): string {
  return `${count} item${count === 1 ? '' : /* @coverage-exclude: plural suffix */ 's'}`;
}
