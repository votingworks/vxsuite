import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { assert, err, ok } from '@votingworks/basics';
import fc from 'fast-check';
import { byteArrayWithLengthPrefix } from './byte_array_with_length_prefix';
import { uint8 } from './uint8_coder';
import { MAX_UINT16, MAX_UINT8 } from './constants';

test('canEncode', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.canEncode(Buffer.from('hello'))).toEqual(true);
  expect(coder.canEncode(1)).toEqual(false);
});

test('default', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.default()).toEqual(Uint8Array.of());
});

test('bitLength', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.bitLength(Uint8Array.of(1, 2, 3))).toEqual(ok(8 + 24));
});

test('encode', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.encode(Uint8Array.of(1, 2, 3))).toEqual(
    ok(Buffer.from([3, 1, 2, 3]))
  );
});

test('decode', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.decode(Buffer.from([3, 1, 2, 3]))).toEqual(
    ok(Uint8Array.of(1, 2, 3))
  );
});

test('encode with small buffer', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  const buffer = Buffer.alloc(3);
  expect(coder.encodeInto(Uint8Array.of(1, 2, 3), buffer, 0)).toEqual(
    err('SmallBuffer')
  );
});

test('encode with length too large', () => {
  const coder = byteArrayWithLengthPrefix(uint8());
  expect(coder.encode(new Uint8Array(MAX_UINT8 + 1))).toEqual(
    err('InvalidValue')
  );
});

test('fixed length (8-bit)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: MAX_UINT8 }), (length) => {
      const coder = byteArrayWithLengthPrefix(length);
      expect(coder.bitLength(new Uint8Array(length))).toEqual(
        ok(8 + length * 8)
      );
      expect(coder.bitLength(new Uint8Array(length + 1))).toEqual(
        err('InvalidValue')
      );
      expect(coder.default()).toHaveLength(length);

      const original = new Uint8Array(length);
      const roundTrip = coder
        .decode(coder.encode(original).unsafeUnwrap())
        .unsafeUnwrap();
      assert(Buffer.compare(original, roundTrip) === 0);

      expect(coder.encode(new Uint8Array(length + 1))).toEqual(
        err('InvalidValue')
      );
      expect(
        coder.encodeInto(new Uint8Array(length + 1), Buffer.alloc(3), 0)
      ).toEqual(err('InvalidValue'));

      if (length !== 0) {
        expect(coder.decode(Buffer.from([length]))).toEqual(err('SmallBuffer'));
      }

      // incorrect length short-circuits
      expect(coder.decode(Buffer.from([length + 1]))).toEqual(
        err('InvalidValue')
      );
    })
  );
});

test('fixed length (16-bit)', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: MAX_UINT8 + 1, max: MAX_UINT16 }),
      (length) => {
        const coder = byteArrayWithLengthPrefix(length);
        expect(coder.bitLength(new Uint8Array(length))).toEqual(
          ok(16 + length * 8)
        );
        expect(coder.bitLength(new Uint8Array(length + 1))).toEqual(
          err('InvalidValue')
        );
        expect(coder.default()).toHaveLength(length);

        const original = new Uint8Array(length);
        const roundTrip = coder
          .decode(coder.encode(original).unsafeUnwrap())
          .unsafeUnwrap();
        assert(Buffer.compare(original, roundTrip) === 0);

        expect(coder.encode(new Uint8Array(length + 1))).toEqual(
          err('InvalidValue')
        );
        expect(
          coder.encodeInto(new Uint8Array(length + 1), Buffer.alloc(3), 0)
        ).toEqual(err('InvalidValue'));

        if (length !== 0) {
          expect(coder.decode(Buffer.from([length]))).toEqual(
            err('SmallBuffer')
          );
        }

        // incorrect length short-circuits
        const buffer = Buffer.alloc(3);
        buffer.writeUInt16LE(Math.floor(length / 2) + 1, 0);
        expect(coder.decodeFrom(buffer, 0)).toEqual(err('InvalidValue'));
      }
    )
  );
});

test('fixed length (unsupported length)', () => {
  expect(() => byteArrayWithLengthPrefix(MAX_UINT16 + 1)).toThrow(
    'byteArrayWithLengthPrefix() does not support length of 65536'
  );
});
