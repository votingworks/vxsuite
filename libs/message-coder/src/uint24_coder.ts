import { type Result, ok, resultBlock } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { MAX_UINT24, MIN_UINT24 } from './constants.js';
import type {
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint24,
} from './types.js';
import { UintCoder } from './uint_coder.js';

/**
 * Coder for a uint24, aka a 24-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint24Coder<T extends number = Uint24> extends UintCoder<T> {
  bitLength(): Result<Uint24, CoderError> {
    return ok(24);
  }

  protected minValue = MIN_UINT24;
  protected maxValue = MAX_UINT24;

  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) => {
        const nextOffset = buffer.writeUInt16LE(value & 0xffff, byteOffset);
        return buffer.writeUInt8((value >> 16) & 0xff, nextOffset);
      });
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) => {
      const low = buffer.readUInt16LE(byteOffset);
      const high = buffer.readUInt8(byteOffset + 2);
      return this.validateValue((high << 16) | low);
    });
  }
}

/**
 * Builds 24-bit unsigned integer coders. Uses little-endian byte order.
 */
export function uint24<T extends number = Uint24>(
  enumeration?: Record<string, T>
): Coder<T> {
  return new Uint24Coder(enumeration);
}
