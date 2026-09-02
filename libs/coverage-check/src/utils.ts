/**
 * Throws; call it where TypeScript has narrowed `value` to `never`. A local
 * stand-in for `@votingworks/basics`'s `throwIllegalValue`, since this package
 * cannot depend on workspace libraries (see README).
 */
export function throwIllegalValue(value: never): never {
  throw new Error(`Illegal value: ${String(value)}`);
}

/**
 * Returns `value` unless it is `undefined`, in which case throws. A local
 * stand-in for `@votingworks/basics`'s `assertDefined`.
 */
export function assertDefined<T>(value?: T): T {
  if (value === undefined) throw new Error('Expected a defined value');
  return value;
}
