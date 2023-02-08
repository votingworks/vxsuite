import { err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BaseCoder } from './base_coder';
import { BITS_PER_BYTE, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  Coder,
  DecodeResult,
  EncodeResult,
  mapResult,
  Uint2,
} from './types';
import { validateEnumValue } from './uint_coder';

/**
 * Coder for a uint2, aka a 2-bit unsigned integer.
 */
class Uint2Coder extends BaseCoder<Uint2> {
  constructor(private readonly enumeration?: unknown) {
    super();
  }

  bitLength(): BitLength {
    return 2;
  }

  protected minValue = 0b00;
  protected maxValue = 0b11;

  encodeInto(value: Uint2, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    const validationResult = validateEnumValue(this.enumeration, value);

    if (validationResult.isErr()) {
      return validationResult;
    }

    const validatedValue = validationResult.ok();

    if (validatedValue < this.minValue || validatedValue > this.maxValue) {
      return err('InvalidValue');
    }

    const remainder = bitOffset % BITS_PER_BYTE;

    if (remainder + 1 >= BITS_PER_BYTE) {
      return err('UnsupportedOffset');
    }

    const shift = BITS_PER_BYTE - remainder - this.bitLength();
    const mask = (1 << (shift + 1)) | (1 << shift);
    const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
      'subtracting remainder, which was checked above, should yield a valid byte offset'
    );

    const byte = buffer.readUInt8(byteOffset);
    const nextByte = (byte & ~mask) | ((validatedValue << shift) & mask);
    buffer.writeUInt8(nextByte, byteOffset);
    return ok(bitOffset + this.bitLength());
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint2> {
    const remainder = bitOffset % BITS_PER_BYTE;

    if (remainder + 1 >= BITS_PER_BYTE) {
      return err('UnsupportedOffset');
    }

    const shift = BITS_PER_BYTE - remainder - this.bitLength();
    const mask = (1 << (shift + 1)) | (1 << shift);
    const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
      'subtracting remainder, which was checked above, should yield a valid byte offset'
    );

    const byte = buffer.readUInt8(byteOffset);
    return mapResult(
      validateEnumValue(this.enumeration, (byte & mask) >> shift),
      (value) => ({ value, bitOffset: bitOffset + this.bitLength() })
    );
  }
}

/**
 * Builds 2-bit unsigned integer coders. Note that this coder works with two
 * bits at a time, so it should be used with other sub-byte coders or with
 * `padding` to preserve alignment.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint2<T extends Uint2>(enumeration?: unknown): Coder<T> {
  return new Uint2Coder(enumeration) as Coder<T>;
}
