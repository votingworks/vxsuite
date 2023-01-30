import { ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fc from 'fast-check';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';
import { uint16 } from './uint16_coder';

test('uint16', () => {
  fc.assert(
    fc.property(
      fc.integer(0, 65535),
      fc.integer({ min: 0, max: 100 }),
      (value, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const buffer = Buffer.alloc(2 + byteOffset);
        const field = uint16();
        type field = CoderType<typeof field>;

        expect(field.encodeInto(value, buffer, bitOffset)).toEqual(
          ok(bitOffset + 16)
        );
        expect(buffer.readUInt16LE(byteOffset)).toEqual(value);
        expect(field.decodeFrom(buffer, bitOffset)).toEqual(
          typedAs<DecodeResult<field>>(ok({ value, bitOffset: bitOffset + 16 }))
        );
      }
    )
  );
});
