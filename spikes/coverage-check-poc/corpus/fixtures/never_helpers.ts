// Driver: throwIllegalValue('boom' as never) inside try/catch, identity('x')
// — both covered. Provides the never-param signature never_param.ts imports.

export function throwIllegalValue(value: never): never {
  throw new Error(`Illegal value: ${JSON.stringify(value)}`);
}

export function identity<T>(value: T): T {
  return value;
}
