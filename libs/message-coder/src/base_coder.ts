import { err, ok, Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { toByteLength } from './bits';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

/**
 * Base class for coders with default implementations for encoding and decoding.
 */
export abstract class BaseCoder<T> implements Coder<T> {
  abstract canEncode(value: unknown): value is T;
  abstract default(): T;
  abstract bitLength(value: T): Result<BitLength, CoderError>;
  abstract encodeInto(
    value: T,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult;
  abstract decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<T>;

  encode(value: T): Result<Buffer, CoderError> {
    return resultBlock((fail) => {
      const buffer = Buffer.alloc(
        toByteLength(this.bitLength(value).okOrElse(fail))
      );
      const result = this.encodeInto(value, buffer, 0);
      return result.isOk() ? ok(buffer) : result;
    });
  }

  decode(buffer: Buffer): Result<T, CoderError> {
    return resultBlock((fail) => {
      const { bitOffset, value } = this.decodeFrom(buffer, 0).okOrElse(fail);
      if (toByteLength(bitOffset) !== buffer.byteLength) {
        return err('TrailingData');
      }
      return value;
    });
  }
}
