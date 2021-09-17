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
  )
}
