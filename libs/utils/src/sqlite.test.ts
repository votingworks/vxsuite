import { expect, test } from 'vitest';
import { asSqliteBool, fromSqliteBool } from './sqlite';

test('asSqliteBool', () => {
  expect(asSqliteBool(false)).toEqual(0);
  expect(asSqliteBool(true)).toEqual(1);
});

test('fromSqliteBool', () => {
  expect(fromSqliteBool(0)).toEqual(false);
  expect(fromSqliteBool(1)).toEqual(true);
});
