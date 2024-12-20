import { Result, err, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { BITS_PER_BYTE, bufferContainsBitOffset, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

/**
 * Coder for a uint1, aka a boolean.
 */
export class Uint1Coder extends BaseCoder<boolean> {
  canEncode(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  default(): boolean {
    return false;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(1);
  }

  encodeInto(
    value: boolean,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      if (
        !bufferContainsBitOffset(
          buffer,
          bitOffset,
          this.bitLength().okOrElse(fail)
        )
      ) {
        return err('SmallBuffer');
      }

      const remainder = bitOffset % BITS_PER_BYTE;
      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );
      const mask = 0x80 >> remainder;
      const byte = buffer.readUInt8(byteOffset);
      const nextByte = (byte & ~mask) | ((value ? 1 : 0) << (7 - remainder));
      buffer.writeUInt8(nextByte, byteOffset);
      return bitOffset + this.bitLength().okOrElse(fail);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<boolean> {
    return resultBlock((fail) => {
      if (
        !bufferContainsBitOffset(
          buffer,
          bitOffset,
          this.bitLength().okOrElse(fail)
        )
      ) {
        return err('SmallBuffer');
      }

      const remainder = bitOffset % BITS_PER_BYTE;
      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );
      const mask = 0x80 >> remainder;
      const byte = buffer.readUInt8(byteOffset);
      const value = !!(byte & mask);
      return {
        value,
        bitOffset: bitOffset + this.bitLength().okOrElse(fail),
      };
    });
  }
}

/**
 * Builds 1-bit unsigned integer coders. Note that this coder works with a
 * single bit at a time, so it should be used with other sub-byte coders or with
 * `padding` to preserve alignment.
 */
export function uint1(): Coder<boolean> {
  return new Uint1Coder();
}
