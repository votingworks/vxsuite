import { expect, test } from 'vitest';
import { z } from 'zod';
import { safeParseJson } from './parse_json';

test('safeParseJson', () => {
  expect(safeParseJson('{"a":1}').unsafeUnwrap()).toEqual({ a: 1 });
  expect(
    safeParseJson('{"a":1}', z.object({ a: z.number() })).unsafeUnwrap()
  ).toEqual({ a: 1 });
  expect(safeParseJson('{"a":1}', z.string()).err()).toBeInstanceOf(z.ZodError);
  expect(safeParseJson('{a:1}').err()).toBeInstanceOf(SyntaxError);
});
