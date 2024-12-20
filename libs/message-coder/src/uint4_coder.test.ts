import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import { MAX_UINT4 } from './constants';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint4 } from './uint4_coder';

test('uint4', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 15 }),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(1 + byteOffset);
        const field = uint4();
        type field = CoderType<typeof field>;

        expect(field.canEncode(value)).toEqual(true);
        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 4)
        );
        expect(buffer.readUInt8(byteOffset) & 0xf0).toEqual(value << 4);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual<
          DecodeResult<field>
        >(ok({ value, bitOffset: bitOffset + 4 }));

        expect(field.encodeInto(value, buffer, bitOffset + 4)).toEqual(
          ok(bitOffset + 8)
        );
        expect(buffer.readUInt8(byteOffset) & 0x0f).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset + 4)).toEqual<
          DecodeResult<field>
        >(
          ok({
            value,
            bitOffset: bitOffset + 8,
          })
        );
      }
    )
  );
});

test('uint4 with enumeration', () => {
  enum Speed {
    Slow = 0,
    Medium = 1,
    Fast = 2,
  }

  const coder = uint4<Speed>(Speed);

  // encode/decode
  expect(coder.canEncode(Speed.Fast)).toEqual(true);
  expect(coder.canEncode(3)).toEqual(false);
  expect(coder.encode(Speed.Fast)).toEqual(ok(Buffer.from([0b00100000])));
  expect(coder.decode(Buffer.from([0b00100000]))).toEqual(ok(Speed.Fast));

  // @ts-expect-error - 3 is not a valid enum value
  expect(coder.encode(3)).toEqual(err('InvalidValue'));
  expect(coder.decode(Buffer.from([0b00110000]))).toEqual(err('InvalidValue'));

  // encodeInto/decodeFrom
  const buffer = Buffer.alloc(1);
  expect(coder.encodeInto(Speed.Fast, buffer, 0)).toEqual(ok(4));
  expect(buffer.readUInt8(0)).toEqual(0b00100000);
  expect(coder.decodeFrom(buffer, 0)).toEqual(
    ok({ value: Speed.Fast, bitOffset: 4 })
  );

  // @ts-expect-error - 3 is not a valid enum value
  expect(coder.encodeInto(3, buffer, 0)).toEqual(err('InvalidValue'));
  buffer.writeUInt8(0b00110000, 0);
  expect(coder.decodeFrom(buffer, 0)).toEqual(err('InvalidValue'));
});

test('uint4 with invalid offset', () => {
  const coder = uint4();
  expect(coder.encodeInto(1, Buffer.alloc(1), 2)).toEqual(
    err('UnsupportedOffset')
  );
  expect(coder.decodeFrom(Buffer.alloc(1), 2)).toEqual(
    err('UnsupportedOffset')
  );
});

test('uint4 with invalid value', () => {
  const coder = uint4();
  expect(coder.encode(-1)).toEqual(err('InvalidValue'));
  expect(coder.encode(MAX_UINT4 + 1)).toEqual(err('InvalidValue'));
});
