import { Buffer } from 'node:buffer';
import { Result, ok, resultBlock } from '@votingworks/basics';
import { MAX_UINT16, MIN_UINT16 } from './constants';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  Uint16,
} from './types';
import { UintCoder } from './uint_coder';

interface Uint16CoderOptions {
  littleEndian: boolean;
}

/**
 * Coder for a uint16, aka a 16-bit unsigned integer. Uses little-endian byte
 * order.
 */
export class Uint16Coder extends UintCoder {
  private readonly littleEndian: boolean;

  constructor(
    enumeration?: unknown,
    { littleEndian = true }: Partial<Uint16CoderOptions> = {}
  ) {
    super(enumeration);
    this.littleEndian = littleEndian;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(16);
  }

  protected minValue = MIN_UINT16;
  protected maxValue = MAX_UINT16;

  encodeInto(
    value: Uint16,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      this.validateValue(value).okOrElse(fail);

      return this.encodeUsing(buffer, bitOffset, (byteOffset) =>
        this.littleEndian
          ? buffer.writeUInt16LE(value, byteOffset)
          : buffer.writeUInt16BE(value, byteOffset)
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Uint16> {
    return this.decodeUsing(buffer, bitOffset, (byteOffset) =>
      this.validateValue(
        this.littleEndian
          ? buffer.readUInt16LE(byteOffset)
          : buffer.readUInt16BE(byteOffset)
      )
    );
  }
}

/**
 * Builds a coder for a uint16. Uses little-endian byte order.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics -- TS does not have a way of saying "I want an enum of numbers"
export function uint16<T extends number = Uint16>(
  enumeration?: unknown,
  options?: Uint16CoderOptions
): Coder<T> {
  return new Uint16Coder(enumeration, options) as unknown as Coder<T>;
}
