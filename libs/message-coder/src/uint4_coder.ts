import { Result, err, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { BITS_PER_BYTE, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint4,
} from './types';
import { defaultEnumValue, validateEnumValue } from './uint_coder';

/**
 * Coder for a uint4, aka a 4-bit unsigned integer.
 */
export class Uint4Coder extends BaseCoder<Uint4> {
  constructor(private readonly enumeration?: unknown) {
    super();
  }

  canEncode(value: unknown): value is number {
    return typeof value === 'number' && this.validateValue(value).isOk();
  }

  default(): Uint4 {
    return defaultEnumValue(this.enumeration);
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(4);
  }

  protected minValue = 0b0000;
  protected maxValue = 0b1111;

  encodeInto(value: Uint4, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
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

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint4> {
    return resultBlock((fail) => {
      const remainder = bitOffset % BITS_PER_BYTE;
      const isHigh = remainder === 0;
      const isLow = remainder === 4;

      if (!isHigh && !isLow) {
        return err('UnsupportedOffset');
      }

      const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
        'subtracting remainder, which was checked above, should yield a valid byte offset'
      );
      const shift = isHigh ? this.bitLength().okOrElse(fail) : 0;
      const byte = buffer.readUInt8(byteOffset);
      const value = validateEnumValue(
        this.enumeration,
        (byte >> shift) & 0xf
      ).okOrElse(fail);
      return { value, bitOffset: bitOffset + this.bitLength().okOrElse(fail) };
    });
  }

  protected validateValue(value: number): Result<Uint4, CoderError> {
    return resultBlock((fail) => {
      const validatedValue = validateEnumValue(
        this.enumeration,
        value
      ).okOrElse(fail);

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
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint4<T extends number = Uint4>(
  enumeration?: unknown
): Coder<T> {
  return new Uint4Coder(enumeration) as unknown as Coder<T>;
}
