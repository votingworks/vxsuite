import { expect, test } from 'vitest';
import { z } from 'zod/v4';
import {
  type BallotStyleQrCode,
  parseBallotStyleQrCode,
} from './ballot_style_qr_code.js';
import { encodeBallotStyleQrCode } from '../../test/barcode_helpers.js';

test('parses a ballot style ID', () => {
  expect(parseBallotStyleQrCode('{"bId":"1_en"}').unsafeUnwrap()).toEqual({
    ballotStyleId: '1_en',
  });
});

test('parses a ballot style ID and precinct ID', () => {
  expect(
    parseBallotStyleQrCode('{"bId":"1_en","pId":"precinct-1"}').unsafeUnwrap()
  ).toEqual({ ballotStyleId: '1_en', precinctId: 'precinct-1' });
});

test('rejects invalid JSON', () => {
  expect(parseBallotStyleQrCode('not json').err()).toBeInstanceOf(SyntaxError);
});

test.each([
  ['missing ballot style ID', '{"pId":"precinct-1"}'],
  ['non-string ballot style ID', '{"bId":1}'],
  ['non-string precinct ID', '{"bId":"1_en","pId":1}'],
  ['full-length keys', '{"ballotStyleId":"1_en"}'],
  ['non-object', '"1_en"'],
])('rejects %s', (_, text) => {
  expect(parseBallotStyleQrCode(text).err()).toBeInstanceOf(z.ZodError);
});

test('round-trips through encode and parse', () => {
  const qrCode: BallotStyleQrCode = {
    ballotStyleId: '4-F_zh-Hant',
    precinctId: 'precinct-c2',
  };
  expect(
    parseBallotStyleQrCode(encodeBallotStyleQrCode(qrCode)).unsafeUnwrap()
  ).toEqual(qrCode);
});
