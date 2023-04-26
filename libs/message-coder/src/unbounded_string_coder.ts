import { err, ok, Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'buffer';
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
  default(): string {
    return '';
  }

  bitLength(string: string): BitLength {
    return toBitLength(Buffer.from(string).byteLength);
  }

  encode(value: string): Result<Buffer, CoderError> {
    return ok(Buffer.from(value));
  }

  encodeInto(
    value: string,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((ret) => {
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

      return toBitOffset(bytes.copy(buffer, toByteOffset(bitOffset).or(ret)));
    });
  }

  decode(buffer: Buffer): Result<string, CoderError> {
    return ok(buffer.toString('utf8'));
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<string> {
    return resultBlock((ret) => {
      if (!bufferContainsBitOffset(buffer, bitOffset)) {
        return err('SmallBuffer');
      }

      return {
        value: buffer.toString('utf8', toByteOffset(bitOffset).or(ret)),
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
