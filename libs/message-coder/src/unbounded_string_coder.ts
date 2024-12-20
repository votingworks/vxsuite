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
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

/**
 * Represents a string of unknown length. As it is not terminated, it is
 * required to be the last field in a message.
 */
export class UnboundedStringCoder implements Coder<string> {
  canEncode(value: unknown): value is string {
    return typeof value === 'string';
  }

  default(): string {
    return '';
  }

  bitLength(string: string): Result<BitLength, CoderError> {
    return ok(toBitLength(Buffer.from(string).byteLength));
  }

  encode(value: string): Result<Buffer, CoderError> {
    return ok(Buffer.from(value));
  }

  encodeInto(
    value: string,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      const bytes = Buffer.from(value);

      if (
        !bufferContainsBitOffset(
          buffer,
          bitOffset,
          toBitLength(bytes.byteLength)
        )
      ) {
        return err('SmallBuffer');
      }

      return toBitOffset(
        bytes.copy(buffer, toByteOffset(bitOffset).okOrElse(fail))
      );
    });
  }

  decode(buffer: Buffer): Result<string, CoderError> {
    return ok(buffer.toString('utf8'));
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<string> {
    return resultBlock((fail) => {
      if (!bufferContainsBitOffset(buffer, bitOffset)) {
        return err('SmallBuffer');
      }

      return {
        value: buffer.toString('utf8', toByteOffset(bitOffset).okOrElse(fail)),
        bitOffset: toBitLength(buffer.byteLength),
      };
    });
  }
}

/**
 * Builds a coder for an unbounded string. Must appear at the end of a message.
 */
export function unboundedString(): Coder<string> {
  return new UnboundedStringCoder();
}
