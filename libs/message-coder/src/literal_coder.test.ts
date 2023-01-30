import { ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fc from 'fast-check';
import { literal } from './literal_coder';
import { CoderType } from './message_coder';
import { DecodeResult } from './types';

test('literal', () => {
  fc.assert(
    fc.property(
      fc.array(fc.oneof(fc.integer(0, 255), fc.string()), {
        minLength: 1,
        maxLength: 100,
      }),
      fc.integer({ min: 0, max: 100 }),
      (parts, byteOffset) => {
        const bitOffset = byteOffset * 8;
        const bytes = parts.reduce<Buffer>(
          (buffer, part) =>
            Buffer.concat([
              buffer,
              typeof part === 'string' ? Buffer.from(part) : Buffer.of(part),
            ]),
          Buffer.alloc(0)
        );
        const buffer = Buffer.alloc(bytes.length + byteOffset);
        const lit = literal(...parts);
        type lit = CoderType<typeof lit>;

        expect(lit.encodeInto(undefined, buffer, bitOffset)).toEqual(
          ok(bitOffset + bytes.length * 8)
        );
        expect(buffer.subarray(byteOffset, byteOffset + bytes.length)).toEqual(
          Buffer.from(bytes)
        );
        expect(lit.decodeFrom(buffer, bitOffset)).toEqual(
          typedAs<DecodeResult<lit>>(
            ok({
              value: undefined,
              bitOffset: bitOffset + bytes.length * 8,
            })
          )
        );
      }
    )
  );
});

test('literal with mix of all supported types', () => {
  const coder = literal(1, 'a', 2, 'b', 3, 'c', Buffer.from('ABC'));

  expect(coder.encode()).toEqual(
    ok(Buffer.from([1, 97, 2, 98, 3, 99, 65, 66, 67]))
  );
  expect(coder.decode(Buffer.from([1, 97, 2, 98, 3, 99, 65, 66, 67]))).toEqual(
    ok()
  );
});
