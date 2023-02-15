import { err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BaseCoder } from './base_coder';
import { bufferContainsBitOffset } from './bits';
import { BitOffset, DecodeResult, EncodeResult } from './types';

/**
 * Occupies bits in the buffer without encoding or decoding any data.
 */
export class PaddingCoder extends BaseCoder<void> {
  constructor(private readonly paddingBitsLength: number) {
    super();
  }

  default(): void {
    return undefined;
  }

  bitLength(): number {
    return this.paddingBitsLength;
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

    if (!bufferContainsBitOffset(buffer, nextOffset, this.paddingBitsLength)) {
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
