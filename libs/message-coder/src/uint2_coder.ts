import { type Result, err, ok, resultBlock } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder.js';
import { BITS_PER_BYTE, toByteOffset } from './bits.js';
import type {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  Decoded,
  DecodeResult,
  EncodeResult,
  Uint2,
} from './types.js';
import { defaultEnumValue, validateEnumValue } from './uint_coder.js';

/**
 * Coder for a uint2, aka a 2-bit unsigned integer.
 */
class Uint2Coder<T extends Uint2 = Uint2> extends BaseCoder<T> {
  private readonly enumeration?: Record<string, T>;

  constructor(enumeration?: Record<string, T>) {
    super();
    this.enumeration = enumeration;
  }

  canEncode(value: unknown): value is T {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      this.minValue <= value &&
      value <= this.maxValue
    );
  }

  default(): T {
    return this.enumeration ? defaultEnumValue(this.enumeration) : (0 as T);
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(2);
  }

  protected minValue = 0b00;
  protected maxValue = 0b11;

  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      const validatedValue = this.enumeration
        ? validateEnumValue(this.enumeration, value).okOrElse(fail)
        : value;

      if (validatedValue < this.minValue || validatedValue > this.maxValue) {
        return err('InvalidValue');
      }

      const remainder = bitOffset % BITS_PER_BYTE;

      if (remainder + 1 >= BITS_PER_BYTE) {
        return err('UnsupportedOffset');
      }

      const shift = BITS_PER_BYTE - remainder - this.bitLength().okOrElse(fail);
      const mask = (1 << (shift + 1)) | (1 << shift);
      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );

      const byte = buffer.readUInt8(byteOffset);
      const nextByte = (byte & ~mask) | ((validatedValue << shift) & mask);
      buffer.writeUInt8(nextByte, byteOffset);
      return bitOffset + this.bitLength().okOrElse(fail);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T> {
    return resultBlock((fail): Decoded<T> => {
      const remainder = bitOffset % BITS_PER_BYTE;

      if (remainder + 1 >= BITS_PER_BYTE) {
        return fail('UnsupportedOffset');
      }

      const shift = BITS_PER_BYTE - remainder - this.bitLength().okOrElse(fail);
      const mask = (1 << (shift + 1)) | (1 << shift);
      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );

      const byte = buffer.readUInt8(byteOffset);
      const shifted = (byte & mask) >> shift;
      const value = this.enumeration
        ? validateEnumValue(this.enumeration, shifted).okOrElse(fail)
        : (shifted as T);
      return { value, bitOffset: bitOffset + this.bitLength().okOrElse(fail) };
    });
  }
}

/**
 * Builds 2-bit unsigned integer coders. Note that this coder works with two
 * bits at a time, so it should be used with other sub-byte coders or with
 * `padding` to preserve alignment.
 */
export function uint2<T extends Uint2 = Uint2>(
  enumeration?: Record<string, T>
): Coder<T> {
  return new Uint2Coder(enumeration);
}
