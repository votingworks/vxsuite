import { Result, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { MAX_UINT32, MIN_UINT32 } from './constants';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint32,
} from './types';
import { UintCoder } from './uint_coder';

interface Uint32CoderOptions {
  littleEndian: boolean;
}

/**
 * Coder for a uint32, aka a 32-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint32Coder extends UintCoder {
  private readonly littleEndian: boolean;

  constructor(
    enumeration?: unknown,
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

  encodeInto(
    value: Uint32,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        this.littleEndian
          ? buffer.writeUInt32LE(value, byteOffset)
          : buffer.writeUInt32BE(value, byteOffset)
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint32> {
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
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint32<T extends number = Uint32>(
  enumeration?: unknown,
  options?: Uint32CoderOptions
): Coder<T> {
  return new Uint32Coder(enumeration, options) as unknown as Coder<T>;
}
