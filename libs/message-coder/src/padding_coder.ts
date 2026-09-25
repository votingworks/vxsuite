import { type Result, err, ok } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder.js';
import { bufferContainsBitOffset } from './bits.js';
import type {
  BitLength,
  BitOffset,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types.js';

/**
 * Occupies bits in the buffer without encoding or decoding any data.
 */
export class PaddingCoder extends BaseCoder<void> {
  private readonly paddingBitsLength: number;

  constructor(paddingBitsLength: number) {
    super();
    this.paddingBitsLength = paddingBitsLength;
  }

  canEncode(value: unknown): value is void {
    return value === undefined;
  }

  default(): void {
    return undefined;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(this.paddingBitsLength);
  }

  encodeInto(_value: void, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    const nextOffset = bitOffset + this.paddingBitsLength;

    if (!bufferContainsBitOffset(buffer, nextOffset)) {
      return err('SmallBuffer');
    }

    return ok(nextOffset);
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<void> {
    const nextOffset = bitOffset + this.paddingBitsLength;

    if (!bufferContainsBitOffset(buffer, nextOffset)) {
      return err('SmallBuffer');
    }

    return ok({ value: undefined, bitOffset: nextOffset });
  }
}

/**
 * Builds a padding coder. This coder does not encode or decode any data, but it
 * does consume bits in the buffer.
 */
export function padding(bitLength: number): PaddingCoder {
  return new PaddingCoder(bitLength);
}
