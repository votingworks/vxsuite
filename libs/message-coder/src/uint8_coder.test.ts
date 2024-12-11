import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import { MAX_UINT8 } from './constants';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint8 } from './uint8_coder';

test('uint8', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 255),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(1 + byteOffset);
        const field = uint8();
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 8)
        );
        expect(buffer.readUInt8(byteOffset)).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual<
          DecodeResult<field>
        >(ok({ value, bitOffset: bitOffset + 8 }));
      }
    )
  );
});

test('uint8 decode buffer too small', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 255),
      fc.integer({ min: 0, max: 100 }),
      (value, offset) => {
        const buffer = Buffer.alloc(1 + offset);
        const field = uint8();

        buffer.writeUInt8(value, offset);
        expect(
          field.decodeFrom(buffer, (offset + 1) * 8).assertErr('should fail')
        ).toEqual('SmallBuffer');
      }
    )
  );
});

test('uint8 decode too long buffer', () => {
  const coder = uint8();
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(1, 0);
  buffer.writeUInt8(2, 1);
  expect(coder.decode(buffer)).toEqual(err('TrailingData'));
});

test('uint8 with enumeration', () => {
  enum Enum {
    A = 1,
    B = 2,
    C = 3,
  }

  const field = uint8<Enum>(Enum);
  expect(field.canEncode(Enum.A)).toEqual(true);
  expect(field.canEncode(99)).toEqual(false);
  expect(field.bitLength(Enum.A)).toEqual(ok(8));
  expect(field.encode(Enum.A)).toEqual(ok(Buffer.from([1])));
  expect(field.decode(Buffer.from([1]))).toEqual(ok(Enum.A));
  // @ts-expect-error - 99 is not a valid enum value
  expect(field.encode(99)).toEqual(err('InvalidValue'));
  expect(field.decode(Buffer.from([99]))).toEqual(err('InvalidValue'));
});

test('uint8 with invalid value', () => {
  const coder = uint8();
  expect(coder.encode(-1)).toEqual(err('InvalidValue'));
  expect(coder.encode(MAX_UINT8 + 1)).toEqual(err('InvalidValue'));
});
