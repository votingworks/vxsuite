import { Buffer } from 'buffer';
import { MAX_UINT16, MIN_UINT16 } from './constants';
import {
  BitLength,
  BitOffset,
  Coder,
  DecodeResult,
  EncodeResult,
  mapResult,
  Uint16,
} from './types';
import { UintCoder } from './uint_coder';

/**
 * Coder for a uint16, aka a 16-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint16Coder extends UintCoder {
  bitLength(): BitLength {
    return 16;
  }

  protected minValue = MIN_UINT16;
  protected maxValue = MAX_UINT16;

  encodeInto(
    value: Uint16,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return mapResult(this.validateValue(value), () =>
      this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        buffer.writeUInt16LE(value, byteOffset)
      )
    );
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint16> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(buffer.readUInt16LE(byteOffset))
    );
  }
}

/**
 * Builds a coder for a uint16. Uses little-endian byte order.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint16<T extends number = Uint16>(
  enumeration?: unknown
): Coder<T> {
  return new Uint16Coder(enumeration) as unknown as Coder<T>;
}
