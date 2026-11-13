import { expect, type MockInstance } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/**
 * Alternative to `expect(fn).toHaveBeenCalledWith(...args)` with stricter arg
 * typing.
 *
 * Can be be expanded/refined as needed.
 */
// @coverage-exclude: Test util; caller usage provides coverage.
export function expectToHaveBeenCalledWith<T extends AnyFn>(
  fn: MockInstance<T>,
  ...args: NoInfer<Parameters<T>>
): void {
  expect(fn).toHaveBeenCalledWith(...args);
}

/**
 * Alternative to `expect(fn).toHaveBeenLastCalledWith(...args)` with stricter
 * arg typing.
 *
 * Can be be expanded/refined as needed.
 */
// @coverage-exclude: Test util; caller usage provides coverage.
export function expectToHaveBeenLastCalledWith<T extends AnyFn>(
  fn: MockInstance<T>,
  ...args: NoInfer<Parameters<T>>
): void {
  expect(fn).toHaveBeenLastCalledWith(...args);
}
