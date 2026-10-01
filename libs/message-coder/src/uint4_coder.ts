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
  Uint4,
} from './types.js';
import { defaultEnumValue, validateEnumValue } from './uint_coder.js';

/**
 * Coder for a uint4, aka a 4-bit unsigned integer.
 */
export class Uint4Coder<T extends number = Uint4> extends BaseCoder<T> {
  private readonly enumeration?: Record<string, T>;

  constructor(enumeration?: Record<string, T>) {
    super();
    this.enumeration = enumeration;
  }

  canEncode(value: unknown): value is T {
    return typeof value === 'number' && this.validateValue(value).isOk();
  }

  default(): T {
    return this.enumeration ? defaultEnumValue(this.enumeration) : (0 as T);
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(4);
  }

  protected minValue = 0b0000;
  protected maxValue = 0b1111;

  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      const validatedValue = this.validateValue(value).okOrElse(fail);
      const remainder = bitOffset % BITS_PER_BYTE;
      const isHigh = remainder === 0;
      const isLow = remainder === 4;

      if (!isHigh && !isLow) {
        return err('UnsupportedOffset');
      }

      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );
      const mask = isHigh ? 0x0f : 0xf0;
      const shift = isHigh ? this.bitLength().okOrElse(fail) : 0;
      const byte = buffer.readUInt8(byteOffset);
      const nextByte = (byte & mask) | ((validatedValue << shift) & ~mask);
      buffer.writeUInt8(nextByte, byteOffset);
      return bitOffset + this.bitLength().okOrElse(fail);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T> {
    return resultBlock((fail): Decoded<T> => {
      const remainder = bitOffset % BITS_PER_BYTE;
      const isHigh = remainder === 0;
      const isLow = remainder === 4;

      if (!isHigh && !isLow) {
        return fail('UnsupportedOffset');
      }

      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );
      const shift = isHigh ? this.bitLength().okOrElse(fail) : 0;
      const byte = buffer.readUInt8(byteOffset);
      const nibble = (byte >> shift) & 0xf;
      const value = this.enumeration
        ? validateEnumValue(this.enumeration, nibble).okOrElse(fail)
        : (nibble as T);
      return { value, bitOffset: bitOffset + this.bitLength().okOrElse(fail) };
    });
  }

  protected validateValue(value: number): Result<T, CoderError> {
    return resultBlock((fail) => {
      const validatedValue = this.enumeration
        ? validateEnumValue(this.enumeration, value).okOrElse(fail)
        : (value as T);

      return !Number.isInteger(validatedValue) ||
        validatedValue < this.minValue ||
        validatedValue > this.maxValue
        ? err('InvalidValue')
        : ok(validatedValue);
    });
  }
}

/**
 * Builds 4-bit unsigned integer coders. Note that this coder works with half a
 * byte at a time, so it should be used in pairs or with `padding` to preserve
 * alignment.
 */
export function uint4<T extends number = Uint4>(
  enumeration?: Record<string, T>
): Coder<T> {
  return new Uint4Coder(enumeration);
}
