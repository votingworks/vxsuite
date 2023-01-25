import { ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fc from 'fast-check';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint24 } from './uint24_coder';

test('uint24', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 16777215),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(4 + byteOffset);
        const field = uint24();
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 24)
        );
        expect(buffer.readUInt32LE(byteOffset) & 0x00ffffff).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual(
          typedAs<DecodeResult<field>>(ok({ value, bitOffset: bitOffset + 24 }))
        );
      }
    )
  );
});
