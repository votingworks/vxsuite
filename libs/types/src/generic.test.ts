import { z } from 'zod';
import { MachineId, safeParse } from '.';
import { maybeParse, unsafeParse } from './generic';

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
