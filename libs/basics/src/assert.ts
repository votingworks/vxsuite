/**
 * Asserts that `condition` is true. This function exists to avoid a polyfill
 * for `assert` in the browser.
 */
export function assert(
  condition: unknown,
  message?: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Asserts that `condition` is true. This function exists to avoid a polyfill
 * for `assert` in the browser.
 */
export function assertDefined<T>(entity?: T, message?: string): T {
  if (entity === undefined || entity === null) {
    throw new Error(message);
  }
  return entity;
}

/**
 * Fail with an optional error message.
 */
export function fail(message?: string): never {
  throw new Error(message);
}

/**
 * Use as a compile-time check that the type of `value` has been narrowed to
 * `never`. This is primarily useful when handling cases of a discriminated
 * union or enum.
 *
 * @example
 *
 *   enum PageSize { Letter, Legal }
 *
 *   function print(pageSize: PageSize): void {
 *     switch (pageSize) {
 *       case PageSize.Letter:
 *         // …
 *         break
 *
 *       case PageSize.Legal:
 *         // …
 *         break
 *
 *       default:
 *         throwIllegalValue(pageSize)
 *     }
 *   }
 */
export function throwIllegalValue(value: never, displayKey?: string): never {
  throw new Error(
    `Illegal Value: ${
      displayKey ? (value as { [key: string]: unknown })[displayKey] : value
    }`
  );
}
