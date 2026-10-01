import { type Result, ok, resultBlock } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { MAX_UINT32, MIN_UINT32 } from './constants.js';
import type {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint32,
} from './types.js';
import { UintCoder } from './uint_coder.js';

interface Uint32CoderOptions {
  littleEndian: boolean;
}

/**
 * Coder for a uint32, aka a 32-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint32Coder<T extends number = Uint32> extends UintCoder<T> {
  private readonly littleEndian: boolean;

  constructor(
    enumeration?: Record<string, T>,
    { littleEndian = true }: Partial<Uint32CoderOptions> = {}
  ) {
    super(enumeration);
    this.littleEndian = littleEndian;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(32);
  }

  protected minValue = MIN_UINT32;
  protected maxValue = MAX_UINT32;

  encodeInto(value: T, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        this.littleEndian
          ? buffer.writeUInt32LE(value, byteOffset)
          : buffer.writeUInt32BE(value, byteOffset)
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(
        this.littleEndian
          ? buffer.readUInt32LE(byteOffset)
          : buffer.readUInt32BE(byteOffset)
      )
    );
  }
}

/**
 * Builds a coder for a uint32. Uses little-endian byte order.
 */
export function uint32<T extends number = Uint32>(
  enumeration?: Record<string, T>,
  options?: Uint32CoderOptions
): Coder<T> {
  return new Uint32Coder(enumeration, options);
}
