import { assert, err, ok, type Result, resultBlock } from '@votingworks/basics';
import type { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder.js';
import { bufferContainsBitOffset, toByteOffset } from './bits.js';
import type {
  BitLength,
  BitOffset,
  ByteOffset,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types.js';

/**
 * Validates that a value is a valid enum value.
 */
export function validateEnumValue<T extends number>(
  enumeration: Record<string, T>,
  value: number
): Result<T, CoderError> {
  for (const v of Object.values(enumeration)) {
    if (v === value) {
      return ok(v);
    }
  }
  return err('InvalidValue');
}

/**
 * Gets the default–i.e. first–enum value.
 */
export function defaultEnumValue<T extends number>(
  enumeration: Record<string, T>
): T {
  const [value] = Object.values(enumeration);
  assert(value !== undefined, 'no enum values');
  return value;
}

/**
 * Base coder for byte-aligned uints.
 */
export abstract class UintCoder<
  T extends number = number,
> extends BaseCoder<T> {
  private readonly enumeration?: Record<string, T>;

  constructor(enumeration?: Record<string, T>) {
    super();
    this.enumeration = enumeration;
  }

  canEncode(value: unknown): value is T {
    return typeof value === 'number' && this.validateValue(value).isOk();
  }

  default(): T {
    return this.enumeration ? defaultEnumValue(this.enumeration) : (0 as T);
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
    fn: (byteOffset: ByteOffset) => Result<T, CoderError>
  ): DecodeResult<T> {
    return resultBlock((fail) => {
      const byteOffset = this.getByteOffset(buffer, bitOffset).okOrElse(fail);
      const value = fn(byteOffset).okOrElse(fail);
      return { value, bitOffset: bitOffset + this.bitLength().okOrElse(fail) };
    });
  }

  protected validateValue(value: number): Result<T, CoderError> {
    return resultBlock((fail) => {
      const validatedValue = this.enumeration
        ? validateEnumValue(this.enumeration, value).okOrElse(fail)
        : (value as T);

      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < this.minValue ||
        value > this.maxValue
      ) {
        return err('InvalidValue');
      }

      return validatedValue;
    });
  }

  abstract encodeInto(
    value: T,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult;

  abstract decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T>;
}
