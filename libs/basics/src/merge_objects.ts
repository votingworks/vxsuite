import { assert } from './assert';
import { isBoolean, isNumber, isPlainObject, isString } from './type_guards';

function isPrimitive(value: unknown): boolean {
  return (
    isNumber(value) ||
    isString(value) ||
    isBoolean(value) ||
    value === null ||
    value === undefined
  );
}

/**
 * Recursively merges two plain objects. Objects may only contain other objects
 * or primitive values (excluding arrays).
 */
export function mergeObjects<
  T1 extends Record<string, unknown>,
  T2 extends Record<string, unknown>,
>(object1: T1, object2: T2): T1 & T2 {
  assert(isPlainObject(object1) && isPlainObject(object2));

  // eslint-disable-next-line vx/gts-spread-like-types
  const result = { ...object1 } as unknown as Record<string, unknown>;

  for (const [key2, value2] of Object.entries(object2)) {
    if (isPlainObject(value2)) {
      const value1 = object1[key2] ?? {};
      assert(isPlainObject(value1));
      result[key2] = mergeObjects(value1, value2);
    } else {
      assert(isPrimitive(value2));
      assert(isPrimitive(object1[key2]));
      result[key2] = value2;
    }
  }

  return result as T1 & T2;
}
