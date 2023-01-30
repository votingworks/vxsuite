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
  Uint4,
} from './types';
import { validateEnumValue } from './uint_coder';

/**
 * Coder for a uint4, aka a 4-bit unsigned integer.
 */
export class Uint4Coder extends BaseCoder<Uint4> {
  constructor(private readonly enumeration?: unknown) {
    super();
  }

  bitLength(): BitLength {
    return 4;
  }

  encodeInto(value: Uint4, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
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
    const shift = isHigh ? this.bitLength() : 0;
    const byte = buffer.readUInt8(byteOffset);
    const nextByte = (byte & mask) | ((value << shift) & ~mask);
    buffer.writeUInt8(nextByte, byteOffset);
    return ok(bitOffset + this.bitLength());
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint4> {
    const remainder = bitOffset % BITS_PER_BYTE;
    const isHigh = remainder === 0;
    const isLow = remainder === 4;

    if (!isHigh && !isLow) {
      return err('UnsupportedOffset');
    }

    const byteOffset = toByteOffset(bitOffset - remainder).assertOk(
      'subtracting remainder, which was checked above, should yield a valid byte offset'
    );
    const shift = isHigh ? this.bitLength() : 0;
    const byte = buffer.readUInt8(byteOffset);
    return mapResult(
      validateEnumValue(this.enumeration, (byte >> shift) & 0xf),
      (value) => ({ value, bitOffset: bitOffset + this.bitLength() })
    );
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
  return new Uint4Coder(enumeration) as Coder<T>;
}
