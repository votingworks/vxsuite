import { err, ok, Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { toByteLength } from './bits';
import {
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
  abstract default(): T;
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
    return resultBlock((ret) => {
      const { bitOffset, value } = this.decodeFrom(buffer, 0).or(ret);
      if (toByteLength(bitOffset) !== buffer.byteLength) {
        return err('TrailingData');
      }
      return value;
    });
  }
}
