import { err, ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fc from 'fast-check';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint4 } from './uint4_coder';

test('uint4', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 15),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(1 + byteOffset);
        const field = uint4();
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 4)
        );
        expect(buffer.readUInt8(byteOffset) & 0xf0).toEqual(value << 4);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual(
          typedAs<DecodeResult<field>>(ok({ value, bitOffset: bitOffset + 4 }))
        );

        expect(field.encodeInto(value, buffer, bitOffset + 4)).toEqual(
          ok(bitOffset + 8)
        );
        expect(buffer.readUInt8(byteOffset) & 0x0f).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset + 4)).toEqual(
          typedAs<DecodeResult<field>>(
            ok({
              value,
              bitOffset: bitOffset + 8,
            })
          )
        );
      }
    )
  );
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
