import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import { BITS_PER_BYTE, toByteOffset } from './bits';
import { CoderType } from './message_coder';
import { uint1 } from './uint1_coder';

test('uint1 offset=0', () => {
  const coder = uint1();
  type coder = CoderType<typeof coder>;
  const buffer = Buffer.alloc(1);
  const bitOffset = 0;
  expect(coder.canEncode(true)).toEqual(true);
  expect(coder.canEncode(false)).toEqual(true);
  expect(coder.canEncode(0)).toEqual(false);
  expect(coder.default()).toEqual(false);
  expect(coder.encodeInto(true, buffer, bitOffset)).toEqual(ok(bitOffset + 1));
  expect(buffer.readUInt8(0)).toEqual(0b10000000);
  expect(coder.decodeFrom(buffer, bitOffset)).toEqual(
    ok({ value: true, bitOffset: bitOffset + 1 })
  );
  expect(coder.encodeInto(false, buffer, bitOffset)).toEqual(ok(bitOffset + 1));
  expect(buffer.readUInt8(0)).toEqual(0b00000000);
  expect(coder.decodeFrom(buffer, bitOffset)).toEqual(
    ok({ value: false, bitOffset: bitOffset + 1 })
  );
});

test('uint1 true offset=3', () => {
  const coder = uint1();
  type coder = CoderType<typeof coder>;
  const buffer = Buffer.alloc(1);
  const bitOffset = 3;
  expect(coder.default()).toEqual(false);
  expect(coder.encodeInto(true, buffer, bitOffset)).toEqual(ok(bitOffset + 1));
  expect(buffer.readUInt8(0)).toEqual(0b00010000);
  expect(coder.decodeFrom(buffer, bitOffset)).toEqual(
    ok({ value: true, bitOffset: bitOffset + 1 })
  );
});

test('uint1', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 0, max: 100 }),
      (value, bitOffset) => {
        const remainder = bitOffset % BITS_PER_BYTE;
        const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
          'bitOffset should be aligned after subtracting remainder'
        );
        const buffer = Buffer.alloc(1 + byteOffset);
        const coder = uint1();

        expect(coder.default()).toEqual(false);
        expect(coder.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 1)
        );
        expect(
          (buffer.readUInt8(byteOffset) & (0b10000000 >> remainder)) !== 0
        ).toEqual(value);
        expect(coder.decodeFrom(buffer, bitOffset)).toEqual(
          ok({ value, bitOffset: bitOffset + 1 })
        );
      }
    )
  );
});

test('uint1 out of bounds', () => {
  const coder = uint1();
  expect(coder.encodeInto(true, Buffer.alloc(1), 9)).toEqual(
    err('SmallBuffer')
  );
  expect(coder.decodeFrom(Buffer.alloc(1), 9)).toEqual(err('SmallBuffer'));
});
