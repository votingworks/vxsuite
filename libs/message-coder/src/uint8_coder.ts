import { Result, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { MAX_UINT8, MIN_UINT8 } from './constants';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint8,
} from './types';
import { UintCoder } from './uint_coder';

/**
 * Coder for a uint8, aka an 8-bit unsigned integer.
 */
export class Uint8Coder extends UintCoder {
  bitLength(): Result<BitLength, CoderError> {
    return ok(8);
  }

  protected minValue = MIN_UINT8;
  protected maxValue = MAX_UINT8;

  encodeInto(value: Uint8, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        buffer.writeUInt8(value, byteOffset)
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint8> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(buffer.readUInt8(byteOffset))
    );
  }
}

/**
 * Builds a coder for a uint8.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint8<T extends number = Uint8>(
  enumeration?: unknown
): Coder<T> {
  return new Uint8Coder(enumeration) as unknown as Coder<T>;
}
