import { describe, expect, test } from 'vitest';
import { persistDataReferenceIfDeepEqual } from './structural_sharing';

interface Data {
  a: number;
  b: number;
}

describe('persistDataReferenceIfDeepEqual', () => {
  test('maintains reference if deep equal', () => {
    const oldData: Data = { a: 1, b: 2 };
    const newData: Data = { a: 1, b: 2 };
    const result = persistDataReferenceIfDeepEqual(oldData, newData);
    expect(result).toEqual(oldData);
  });

  test('returns new data if not deep equal', () => {
    const oldData: Data = { a: 1, b: 2 };
    const newData: Data = { a: 1, b: 3 };
    const result = persistDataReferenceIfDeepEqual(oldData, newData);
    expect(result).toEqual(newData);
  });

  test('returns new data if old data is undefined', () => {
    const oldData = undefined;
    const newData: Data = { a: 1, b: 2 };
    const result = persistDataReferenceIfDeepEqual(oldData, newData);
    expect(result).toEqual(newData);
  });
});
