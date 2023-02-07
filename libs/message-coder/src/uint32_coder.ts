import { Buffer } from 'buffer';
import { MAX_UINT32, MIN_UINT32 } from './constants';
import {
  BitLength,
  BitOffset,
  Coder,
  DecodeResult,
  EncodeResult,
  mapResult,
  Uint32,
} from './types';
import { UintCoder } from './uint_coder';

/**
 * Coder for a uint32, aka a 32-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint32Coder extends UintCoder {
  bitLength(): BitLength {
    return 32;
  }

  protected minValue = MIN_UINT32;
  protected maxValue = MAX_UINT32;

  encodeInto(
    value: Uint32,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return mapResult(this.validateValue(value), () =>
      this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        buffer.writeUInt32LE(value, byteOffset)
      )
    );
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint32> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(buffer.readUInt32LE(byteOffset))
    );
  }
}

/**
 * Builds a coder for a uint32. Uses little-endian byte order.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint32<T extends number = Uint32>(
  enumeration?: unknown
): Coder<T> {
  return new Uint32Coder(enumeration) as Coder<T>;
}
