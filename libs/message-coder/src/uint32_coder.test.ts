import { ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fc from 'fast-check';
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
        expect(field.decodeFrom(buffer, bitOffset)).toEqual(
          typedAs<DecodeResult<field>>(ok({ value, bitOffset: bitOffset + 32 }))
        );
      }
    )
  );
});
