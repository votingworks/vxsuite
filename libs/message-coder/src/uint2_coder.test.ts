import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { toBitOffset } from './bits';
import { MAX_UINT2 } from './constants';
import { uint2 } from './uint2_coder';

test('uint2 simple', () => {
  const coder = uint2();

  expect(coder.canEncode(0)).toEqual(true);
  expect(coder.canEncode(1)).toEqual(true);
  expect(coder.canEncode(2)).toEqual(true);
  expect(coder.canEncode(3)).toEqual(true);
  expect(coder.canEncode(4)).toEqual(false);
  expect(coder.default()).toEqual(0);

  // encode/decode
  expect(coder.encode(1)).toEqual(ok(Buffer.from([0b01000000])));
  expect(coder.decode(Buffer.from([0b01000000]))).toEqual(ok(1));

  // encodeInto/decodeFrom
  const buffer = Buffer.alloc(1);
  expect(coder.encodeInto(1, buffer, 0)).toEqual(ok(2));
  expect(buffer.readUInt8(0)).toEqual(0b01000000);
  expect(coder.decodeFrom(buffer, 0)).toEqual(ok({ value: 1, bitOffset: 2 }));
});

test('uint2 with enumeration', () => {
  enum Speed {
    Slow = 1,
    Medium = 2,
    Fast = 3,
  }

  const coder = uint2<Speed>(Speed);

  expect(coder.default()).toEqual(Speed.Slow);

  // encode/decode
  expect(coder.encode(Speed.Fast)).toEqual(ok(Buffer.from([0b11000000])));
  expect(coder.decode(Buffer.from([0b11000000]))).toEqual(ok(Speed.Fast));

  // @ts-expect-error - 0 is not a valid enum value
  expect(coder.encode(0)).toEqual(err('InvalidValue'));
  expect(coder.decode(Buffer.from([0b00000000]))).toEqual(err('InvalidValue'));

  // encodeInto/decodeFrom
  const buffer = Buffer.alloc(1);
  expect(coder.encodeInto(Speed.Fast, buffer, 0)).toEqual(ok(2));
  expect(buffer.readUInt8(0)).toEqual(0b11000000);
  expect(coder.decodeFrom(buffer, 0)).toEqual(
    ok({ value: Speed.Fast, bitOffset: 2 })
  );

  // @ts-expect-error - 0 is not a valid enum value
  expect(coder.encodeInto(0, buffer, 0)).toEqual(err('InvalidValue'));
  buffer.writeUInt8(0b00000000, 0);
  expect(coder.decodeFrom(buffer, 0)).toEqual(err('InvalidValue'));
});

test('uint2 with arbitrary in-byte offset', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 3),
      fc.integer(0, 6),
      fc.integer(0, 100),
      (value, shift, byteOffset) => {
        const coder = uint2();
        const buffer = Buffer.alloc(byteOffset + 1);
        const bitOffset = toBitOffset(byteOffset) + shift;
        const encoded = coder.encodeInto(value, buffer, bitOffset);

        expect(coder.default()).toEqual(0);
        expect(encoded).toEqual(ok(bitOffset + 2));
        expect(buffer.readUInt8(byteOffset)).toEqual(value << (8 - shift - 2));
        expect(coder.decodeFrom(buffer, bitOffset)).toEqual(
          ok({ value, bitOffset: bitOffset + 2 })
        );
      }
    )
  );
});

test('uint2 with unsupported offset', () => {
  const coder = uint2();
  expect(coder.encodeInto(1, Buffer.alloc(1), 7)).toEqual(
    err('UnsupportedOffset')
  );
  expect(coder.decodeFrom(Buffer.alloc(1), 7)).toEqual(
    err('UnsupportedOffset')
  );
});

test('uint2 with invalid values', () => {
  const coder = uint2();
  expect(coder.encode(-1)).toEqual(err('InvalidValue'));
  expect(coder.encode(MAX_UINT2 + 1)).toEqual(err('InvalidValue'));
});
