import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { toBitOffset } from './bits';
import { fixedString } from './fixed_string';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';

test('fixed string', () => {
  const coder = fixedString(5);
  type coder = CoderType<typeof coder>;

  expect(coder.canEncode('hello')).toEqual(true);
  expect(coder.canEncode(1)).toEqual(false);
  expect(coder.default()).toEqual('');
  expect(coder.bitLength('hello')).toEqual(ok(40));
  expect(coder.encode('hello')).toEqual(ok(Buffer.from('hello')));
  expect(coder.decode(Buffer.from('hello'))).toEqual(ok('hello'));

  const buffer = Buffer.alloc(10).fill(1);
  expect(coder.encodeInto('abc', buffer, 0)).toEqual(ok(40));
  // 0x01 is the fill value
  expect(buffer).toEqual(Buffer.from('abc\0\0\x01\x01\x01\x01\x01'));
  expect(coder.decodeFrom(buffer, 0)).toEqual<DecodeResult<coder>>(
    ok({ value: 'abc', bitOffset: 40 })
  );
});

test('fixed string with trailing nulls', () => {
  const coder = fixedString(5, true);
  type coder = CoderType<typeof coder>;
  const buffer = Buffer.alloc(5);

  expect(coder.default()).toEqual('\0\0\0\0\0');
  expect(coder.encodeInto('abc', buffer, 0)).toEqual(ok(40));
  expect(coder.decodeFrom(buffer, 0)).toEqual<DecodeResult<coder>>(
    ok({ value: 'abc\0\0', bitOffset: 40 })
  );
  expect(coder.decode(buffer)).toEqual(ok('abc\0\0'));
});

test('fixed string with small buffer', () => {
  const coder = fixedString(5);
  const buffer = Buffer.alloc(4);
  expect(coder.encodeInto('abc', buffer, 0)).toEqual(err('SmallBuffer'));
  expect(coder.encode('abcdefg')).toEqual(err('SmallBuffer'));
  expect(coder.decodeFrom(buffer, 0)).toEqual(err('SmallBuffer'));
  expect(coder.decode(buffer)).toEqual(err('SmallBuffer'));
});

test('fixed string with trailing data', () => {
  const coder = fixedString(5);
  expect(coder.decode(Buffer.alloc(10))).toEqual(err('TrailingData'));
});

test('fixed string random', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.integer(0, 100),
      (s, byteOffset) => {
        const bitOffset = toBitOffset(byteOffset);
        const byteLength = Buffer.byteLength(s);
        const coder = fixedString(s.length);
        type coder = CoderType<typeof coder>;

        // encode/decode
        expect(coder.encode(s)).toEqual(ok(Buffer.from(s)));
        expect(coder.decode(Buffer.from(s))).toEqual(ok(s));

        // encodeInto/decodeFrom
        const buffer = Buffer.alloc(byteLength + byteOffset);
        expect(coder.encodeInto(s, buffer, toBitOffset(byteOffset))).toEqual(
          ok(bitOffset + coder.bitLength(s).unsafeUnwrap())
        );
        expect(buffer.slice(byteOffset).toString('utf8')).toEqual(s);
        expect(coder.decodeFrom(buffer, toBitOffset(byteOffset))).toEqual<
          DecodeResult<coder>
        >(ok({ value: s, bitOffset: toBitOffset(byteOffset + byteLength) }));
      }
    )
  );
});
