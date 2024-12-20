import { err, ok, Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { bufferContainsBitOffset, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  ByteOffset,
  CoderError,
  DecodeResult,
  EncodeResult,
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
 * Gets the default–i.e. first–enum value.
 */
export function defaultEnumValue(enumeration: unknown): number {
  if (typeof enumeration === 'object') {
    const e = enumeration as Record<string, number | string>;

    for (const value of Object.values(e)) {
      if (typeof value === 'number') {
        return value;
      }
    }

    /* istanbul ignore next - @preserve */
    throw new Error('no enum values');
  }

  return 0;
}

/**
 * Base coder for byte-aligned uints.
 */
export abstract class UintCoder extends BaseCoder<number> {
  constructor(private readonly enumeration?: unknown) {
    super();
  }

  canEncode(value: unknown): value is number {
    return typeof value === 'number' && this.validateValue(value).isOk();
  }

  default(): number {
    return defaultEnumValue(this.enumeration);
  }

  abstract bitLength(): Result<BitLength, CoderError>;
  protected abstract readonly minValue: number;
  protected abstract readonly maxValue: number;

  protected getByteOffset(
    buffer: Buffer,
    bitOffset: BitOffset
  ): Result<number, CoderError> {
    return resultBlock((fail) => {
      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      return bufferContainsBitOffset(
        buffer,
        bitOffset,
        this.bitLength().okOrElse(fail)
      )
        ? ok(byteOffset)
        : err('SmallBuffer');
    });
  }

  protected encodeUsing(
    buffer: Buffer,
    bitOffset: BitOffset,
    fn: (byteOffset: ByteOffset) => void
  ): EncodeResult {
    return resultBlock((fail) => {
      const byteOffset = this.getByteOffset(buffer, bitOffset).okOrElse(fail);
      fn(byteOffset);
      return bitOffset + this.bitLength().okOrElse(fail);
    });
  }

  protected decodeUsing(
    buffer: Buffer,
    bitOffset: BitOffset,
    fn: (byteOffset: ByteOffset) => Result<number, CoderError>
  ): DecodeResult<number> {
    return resultBlock((fail) => {
      const byteOffset = this.getByteOffset(buffer, bitOffset).okOrElse(fail);
      const value = fn(byteOffset).okOrElse(fail);
      return { value, bitOffset: bitOffset + this.bitLength().okOrElse(fail) };
    });
  }

  protected validateValue(value: number): Result<number, CoderError> {
    return resultBlock((fail) => {
      validateEnumValue(this.enumeration, value).okOrElse(fail);

      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < this.minValue ||
        value > this.maxValue
      ) {
        return err('InvalidValue');
      }

      return value;
    });
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
