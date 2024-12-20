import { err, ok, Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  bufferContainsBitOffset,
  toBitLength,
  toBitOffset,
  toByteOffset,
} from './bits';
import {
  BitLength,
  BitOffset,
  ByteLength,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

/**
 * Represents a string of fixed length.
 */
export class FixedStringCoder implements Coder<string> {
  constructor(
    private readonly byteLength: ByteLength,
    private readonly includeTrailingNulls = false
  ) {}

  canEncode(value: unknown): value is string {
    return typeof value === 'string';
  }

  default(): string {
    if (!this.includeTrailingNulls) {
      return '';
    }

    return Buffer.alloc(this.byteLength).toString('utf8');
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(toBitLength(this.byteLength));
  }

  encode(value: string): Result<Buffer, CoderError> {
    const valueLength = Buffer.byteLength(value, 'utf8');
    if (valueLength > this.byteLength) {
      return err('SmallBuffer');
    }

    const bytes = Buffer.alloc(this.byteLength);
    bytes.write(value, 0, this.byteLength, 'utf8');
    return ok(bytes);
  }

  encodeInto(
    value: string,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    // NOTE: Most coders call `encodeInto` from `encode`, but here it's the
    // reverse because it's easier to allocate a buffer from a string using
    // `Buffer.byteLength` and `Buffer#write` in `encode` and to reuse that work
    // here.
    return resultBlock((fail) => {
      const bytes = this.encode(value).okOrElse(fail);
      if (
        !bufferContainsBitOffset(
          buffer,
          bitOffset,
          toBitLength(bytes.byteLength)
        )
      ) {
        return err('SmallBuffer');
      }

      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      return bitOffset + toBitOffset(bytes.copy(buffer, byteOffset));
    });
  }

  decode(buffer: Buffer): Result<string, CoderError> {
    if (!bufferContainsBitOffset(buffer, 0, toBitLength(this.byteLength))) {
      return err('SmallBuffer');
    }

    if (this.byteLength < buffer.byteLength) {
      return err('TrailingData');
    }

    const string = buffer.toString('utf8', 0, this.byteLength);
    return ok(this.includeTrailingNulls ? string : string.replace(/\0+$/, ''));
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<string> {
    return resultBlock((fail) => {
      if (!bufferContainsBitOffset(buffer, 0, toBitLength(this.byteLength))) {
        return err('SmallBuffer');
      }

      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      const string = buffer.toString(
        'utf8',
        byteOffset,
        byteOffset + this.byteLength
      );
      return {
        value: this.includeTrailingNulls ? string : string.replace(/\0+$/, ''),
        bitOffset: bitOffset + toBitOffset(this.byteLength),
      };
    });
  }
}

/**
 * Builds a coder for a fixed-length string.
 */
export function fixedString(
  byteLength: ByteLength,
  includeTrailingNulls?: boolean
): Coder<string> {
  return new FixedStringCoder(byteLength, includeTrailingNulls);
}
