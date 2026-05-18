/**
 * Wraps an arrow function in a regular `function` so it can be used as a
 * constructor mock with vitest 4.
 *
 * Vitest 4 enforces JavaScript's rule that arrow functions cannot be invoked
 * with `new` (they have no `[[Construct]]` slot), so mocking a class with
 * `vi.fn(() => instance)` or `.mockImplementation(() => instance)` throws
 * `TypeError: ... is not a constructor`. The fix is to provide a real
 * `function` expression instead, but the codebase's `prefer-arrow-callback`
 * lint rule rewrites `function` expressions back to arrow functions on save.
 *
 * `mockConstructor` centralizes the workaround: callers stay in idiomatic
 * arrow-function style, and the single `function` literal + lint suppression
 * lives here.
 *
 * @example
 *
 * ```ts
 * vi.mocked(CardReader).mockImplementation(
 *   mockConstructor((...args) => new MockCardReader(...args))
 * );
 * ```
 */
export function mockConstructor<Args extends readonly unknown[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  // eslint-disable-next-line func-names
  return function (...args: Args) {
    return fn(...args);
  };
}
