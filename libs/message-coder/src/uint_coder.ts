import { Buffer } from 'buffer';
import { err, ok, Result } from '@votingworks/basics';
import { BaseCoder } from './base_coder';
import { bufferContainsBitOffset, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  ByteOffset,
  CoderError,
  DecodeResult,
  EncodeResult,
  mapResult,
} from './types';

/**
 * Validates that a value is a valid enum value.
 */
export function validateEnumValue(
  enumeration: unknown,
  value: number
): EncodeResult {
  if (typeof enumeration === 'object') {
    const e = enumeration as Record<string, number | string>;
    const lookup = e[value];

    if (typeof lookup !== 'string' || e[lookup] !== value) {
      return err('InvalidValue');
    }
  }
  return ok(value);
}

/**
 * Base coder for byte-aligned uints.
 */
export abstract class UintCoder extends BaseCoder<number> {
  constructor(private readonly enumeration?: unknown) {
    super();
  }

  abstract bitLength(): BitLength;
  protected abstract readonly minValue: number;
  protected abstract readonly maxValue: number;

  protected getByteOffset(
    buffer: Buffer,
    bitOffset: BitOffset
  ): Result<number, CoderError> {
    return mapResult(toByteOffset(bitOffset), (byteOffset) =>
      bufferContainsBitOffset(buffer, bitOffset, this.bitLength())
        ? ok(byteOffset)
        : err('SmallBuffer')
    );
  }

  protected encodeUsing(
    buffer: Buffer,
    bitOffset: BitOffset,
    fn: (byteOffset: ByteOffset) => void
  ): EncodeResult {
    return mapResult(
      this.getByteOffset(buffer, bitOffset),
      (byteOffset): Result<BitOffset, CoderError> => {
        fn(byteOffset);
        return ok(bitOffset + this.bitLength());
      }
    );
  }

  protected decodeUsing(
    buffer: Buffer,
    bitOffset: BitOffset,
    fn: (byteOffset: ByteOffset) => Result<number, CoderError>
  ): DecodeResult<number> {
    return mapResult(
      mapResult(this.getByteOffset(buffer, bitOffset), (byteOffset) =>
        fn(byteOffset)
      ),
      (value) => ({ value, bitOffset: bitOffset + this.bitLength() })
    );
  }

  protected validateValue(value: number): Result<number, CoderError> {
    const enumValidationResult = validateEnumValue(this.enumeration, value);

    if (enumValidationResult.isErr()) {
      return enumValidationResult;
    }

    if (value < this.minValue || value > this.maxValue) {
      return err('InvalidValue');
    }

    return ok(value);
  }

  abstract encodeInto(
    value: number,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult;

  abstract decodeFrom(
    buffer: Buffer,
    bitOffset: BitOffset
  ): DecodeResult<number>;
}
