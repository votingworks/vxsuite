import { type Result, ok, resultBlock } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { MAX_UINT8, MIN_UINT8 } from './constants.js';
import type {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint8,
} from './types.js';
import { UintCoder } from './uint_coder.js';

/**
 * Coder for a uint8, aka an 8-bit unsigned integer.
 */
export class Uint8Coder<T extends number = Uint8> extends UintCoder<T> {
  bitLength(): Result<BitLength, CoderError> {
    return ok(8);
  }

  protected minValue = MIN_UINT8;
  protected maxValue = MAX_UINT8;

  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        buffer.writeUInt8(value, byteOffset)
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(buffer.readUInt8(byteOffset))
    );
  }
}

/**
 * Builds a coder for a uint8.
 */
export function uint8<T extends number = Uint8>(
  enumeration?: Record<string, T>
): Coder<T> {
  return new Uint8Coder(enumeration);
}
