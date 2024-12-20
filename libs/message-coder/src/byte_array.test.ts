import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
import { byteArray } from './byte_array';

test('canEncode', () => {
  const coder = byteArray(5);
  expect(coder.canEncode(Buffer.from('hello'))).toEqual(true);
  expect(coder.canEncode(Buffer.from('hi'))).toEqual(false);
  expect(coder.canEncode(1)).toEqual(false);
});

test('default', () => {
  const coder = byteArray(5);
  expect(coder.default()).toEqual(new Uint8Array(5));
});

test('bitLength', () => {
  const coder = byteArray(5);
  expect(coder.bitLength(Buffer.from('hello'))).toEqual(ok(5 * 8));
  expect(coder.bitLength(Buffer.from('hi'))).toEqual(err('InvalidValue'));
});

test('encode/decode', () => {
  const coder = byteArray(5);
  const buffer = Buffer.from('hello');
  expect(coder.encode(buffer)).toEqual(ok(buffer));
  expect(coder.decode(buffer)).toEqual(
    ok(Uint8Array.of(104, 101, 108, 108, 111))
  );
});
