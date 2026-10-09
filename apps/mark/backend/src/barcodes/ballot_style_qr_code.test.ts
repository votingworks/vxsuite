import { expect, test } from 'vitest';
import { z } from 'zod/v4';
import { parseBallotStyleQrCode } from './ballot_style_qr_code.js';

test('parses a ballot style ID', () => {
  expect(
    parseBallotStyleQrCode('{"ballotStyleId":"1_en"}').unsafeUnwrap()
  ).toEqual({ ballotStyleId: '1_en' });
});

test('parses a ballot style ID and precinct ID', () => {
  expect(
    parseBallotStyleQrCode(
      '{"ballotStyleId":"1_en","precinctId":"precinct-1"}'
    ).unsafeUnwrap()
  ).toEqual({ ballotStyleId: '1_en', precinctId: 'precinct-1' });
});

test('rejects invalid JSON', () => {
  expect(parseBallotStyleQrCode('not json').err()).toBeInstanceOf(SyntaxError);
});

test.each([
  ['missing ballot style ID', '{"precinctId":"precinct-1"}'],
  ['non-string ballot style ID', '{"ballotStyleId":1}'],
  ['non-string precinct ID', '{"ballotStyleId":"1_en","precinctId":1}'],
  ['non-object', '"1_en"'],
])('rejects %s', (_, text) => {
  expect(parseBallotStyleQrCode(text).err()).toBeInstanceOf(z.ZodError);
});
