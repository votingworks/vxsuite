import { err, ok, Result } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { toByteLength } from './bits';
import {
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
  mapResult,
} from './types';

/**
 * Base class for coders with default implementations for encoding and decoding.
 */
export abstract class BaseCoder<T> implements Coder<T> {
  abstract bitLength(value: T): number;
  abstract encodeInto(
    value: T,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult;
  abstract decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T>;

  encode(value: T): Result<Buffer, CoderError> {
    const buffer = Buffer.alloc(toByteLength(this.bitLength(value)));
    const result = this.encodeInto(value, buffer, 0);
    return result.isOk() ? ok(buffer) : result;
  }

  decode(buffer: Buffer): Result<T, CoderError> {
    return mapResult(this.decodeFrom(buffer, 0), ({ bitOffset, value }) => {
      if (toByteLength(bitOffset) !== buffer.byteLength) {
        return err('TrailingData');
      }

      return ok(value);
    });
  }
}
