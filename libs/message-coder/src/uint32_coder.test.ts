import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import { MAX_UINT32 } from './constants';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint32 } from './uint32_coder';

test('uint32', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 0xffffffff),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(4 + byteOffset);
        const field = uint32();
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 32)
        );
        expect(buffer.readUInt32LE(byteOffset)).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual<
          DecodeResult<field>
        >(ok({ value, bitOffset: bitOffset + 32 }));
      }
    )
  );
});

test('uint32 with little-endian=false', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 0xffffffff),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(4 + byteOffset);
        const field = uint32(undefined, { littleEndian: false });
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 32)
        );
        expect(buffer.readUInt32BE(byteOffset)).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual<
          DecodeResult<field>
        >(ok({ value, bitOffset: bitOffset + 32 }));
      }
    )
  );
});

test('uint32 with enumeration', () => {
  enum Enum {
    A = 1,
    B = 2,
    C = 3,
  }

  const field = uint32<Enum>(Enum);
  expect(field.canEncode(Enum.A)).toEqual(true);
  expect(field.canEncode(99)).toEqual(false);
  expect(field.bitLength(Enum.A)).toEqual(ok(32));
  expect(field.encode(Enum.A)).toEqual(ok(Buffer.from([1, 0, 0, 0])));
  expect(field.decode(Buffer.from([1, 0, 0, 0]))).toEqual(ok(Enum.A));
  // @ts-expect-error - 99 is not a valid enum value
  expect(field.encode(99)).toEqual(err('InvalidValue'));
  expect(field.decode(Buffer.from([99, 0, 0, 0]))).toEqual(err('InvalidValue'));
});

test('uint32 with invalid value', () => {
  const coder = uint32();
  expect(coder.encode(-1)).toEqual(err('InvalidValue'));
  expect(coder.encode(MAX_UINT32 + 1)).toEqual(err('InvalidValue'));
});
