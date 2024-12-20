import { Result, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { MAX_UINT24, MIN_UINT24 } from './constants';
import {
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint24,
} from './types';
import { UintCoder } from './uint_coder';

/**
 * Coder for a uint24, aka a 24-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint24Coder extends UintCoder {
  bitLength(): Result<Uint24, CoderError> {
    return ok(24);
  }

  protected minValue = MIN_UINT24;
  protected maxValue = MAX_UINT24;

  encodeInto(
    value: Uint24,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) => {
        const nextOffset = buffer.writeUInt16LE(value & 0xffff, byteOffset);
        return buffer.writeUInt8((value >> 16) & 0xff, nextOffset);
      });
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint24> {
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
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint24<T extends number = Uint24>(
  enumeration?: unknown
): Coder<T> {
  return new Uint24Coder(enumeration) as unknown as Coder<T>;
}
