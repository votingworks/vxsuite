import { z } from 'zod';
import { DateWithoutTime } from '@votingworks/basics';
import { MachineId, safeParse } from '.';
import {
  DateWithoutTimeSchema,
  maybeParse,
  safeParseJson,
  unsafeParse,
} from './generic';

test('unsafeParse', () => {
  expect(unsafeParse(z.string(), 'hello world!')).toEqual('hello world!');
  expect(() => unsafeParse(z.string(), 99)).toThrowError();
});

test('maybeParse', () => {
  expect(maybeParse(z.string(), 'hello world!')).toEqual('hello world!');
  expect(maybeParse(z.string(), 99)).toBeUndefined();
});

test('machine ID schema', () => {
  // invalid IDs
  safeParse(MachineId, '').unsafeUnwrapErr();
  safeParse(MachineId, 'A_B').unsafeUnwrapErr();
  safeParse(MachineId, 'a-b-0').unsafeUnwrapErr();

  // valid IDs
  safeParse(MachineId, 'A-B-0').unsafeUnwrap();
  safeParse(MachineId, '999').unsafeUnwrap();
});

test('safeParseJson', () => {
  expect(safeParseJson('{"a":1}').unsafeUnwrap()).toEqual({ a: 1 });
  expect(
    safeParseJson('{"a":1}', z.object({ a: z.number() })).unsafeUnwrap()
  ).toEqual({ a: 1 });
  expect(safeParseJson('{"a":1}', z.string()).err()).toBeInstanceOf(z.ZodError);
  expect(safeParseJson('{a:1}').err()).toBeInstanceOf(SyntaxError);
});

test('DateWithoutTime schema', () => {
  expect(
    safeParse(
      DateWithoutTimeSchema,
      new DateWithoutTime('2024-02-22')
    ).unsafeUnwrap()
  ).toEqual(new DateWithoutTime('2024-02-22'));
  safeParse(DateWithoutTimeSchema, '2024-02-22').unsafeUnwrapErr();
});
