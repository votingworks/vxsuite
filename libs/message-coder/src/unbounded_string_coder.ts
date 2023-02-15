import { err, ok, Result } from '@votingworks/basics';
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
  mapResult,
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
    const bytes = Buffer.from(value);

    if (
      !bufferContainsBitOffset(buffer, bitOffset, toBitLength(bytes.byteLength))
    ) {
      return err('SmallBuffer');
    }

    return mapResult(toByteOffset(bitOffset), (byteOffset) =>
      toBitOffset(bytes.copy(buffer, byteOffset))
    );
  }

  decode(buffer: Buffer): Result<string, CoderError> {
    return ok(buffer.toString('utf8'));
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<string> {
    if (!bufferContainsBitOffset(buffer, bitOffset)) {
      return err('SmallBuffer');
    }

    return mapResult(toByteOffset(bitOffset), (byteOffset) => ({
      value: buffer.toString('utf8', byteOffset),
      bitOffset: toBitLength(buffer.byteLength),
    }));
  }
}

/**
 * Builds a coder for an unbounded string. Must appear at the end of a message.
 */
export function unboundedString(): Coder<string> {
  return new UnboundedStringCoder();
}
