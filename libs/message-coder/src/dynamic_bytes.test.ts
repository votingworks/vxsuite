import { Buffer } from 'buffer';
import { err, ok } from '@votingworks/basics';
import { dynamicBytes } from './dynamic_bytes';
import { uint8 } from './uint8_coder';
import { MAX_UINT8 } from './constants';

test('canEncode', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.canEncode(Buffer.from('hello'))).toEqual(true);
  expect(coder.canEncode(1)).toEqual(false);
});

test('default', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.default()).toEqual(Uint8Array.of());
});

test('bitLength', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.bitLength(Uint8Array.of(1, 2, 3))).toEqual(ok(8 + 24));
});

test('encode', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.encode(Uint8Array.of(1, 2, 3))).toEqual(
    ok(Buffer.from([3, 1, 2, 3]))
  );
});

test('decode', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.decode(Buffer.from([3, 1, 2, 3]))).toEqual(
    ok(Uint8Array.of(1, 2, 3))
  );
});

test('encode with small buffer', () => {
  const coder = dynamicBytes(uint8());
  const buffer = Buffer.alloc(3);
  expect(coder.encodeInto(Uint8Array.of(1, 2, 3), buffer, 0)).toEqual(
    err('SmallBuffer')
  );
});

test('encode with length too large', () => {
  const coder = dynamicBytes(uint8());
  expect(coder.encode(new Uint8Array(MAX_UINT8 + 1))).toEqual(
    err('InvalidValue')
  );
});
