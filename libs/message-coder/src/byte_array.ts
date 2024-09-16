import { Result, err, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { CoderError, EncodeResult, DecodeResult, Coder } from './types';
import { toBitLength, toByteOffset, bufferContainsBitOffset } from './bits';

/**
 * Coder for a sequence of bytes of fixed length. Does not encode the length.
 */
export class ByteArrayCoder extends BaseCoder<Uint8Array> {
  constructor(private readonly length: number) {
    super();
  }

  canEncode(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array && value.length === this.length;
  }

  default(): Uint8Array {
    return new Uint8Array(this.length);
  }

  bitLength(value: Uint8Array): Result<number, CoderError> {
    return value.length === this.length
      ? ok(toBitLength(this.length))
      : err('InvalidValue');
  }

  encodeInto(
    value: Uint8Array,
    buffer: Buffer,
    bitOffset: number
  ): EncodeResult {
    return resultBlock((fail) => {
      if (
        !bufferContainsBitOffset(
          buffer,
          bitOffset,
          toBitLength(value.byteLength)
        )
      ) {
        return fail('SmallBuffer');
      }

      buffer.set(value, toByteOffset(bitOffset).okOrElse(fail));
      return bitOffset + toBitLength(value.byteLength);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<Uint8Array> {
    return resultBlock((fail) => {
      if (
        !bufferContainsBitOffset(buffer, bitOffset, toBitLength(this.length))
      ) {
        return fail('SmallBuffer');
      }

      // copy directly from the underlying buffer to avoid extra allocations
      const value = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset + toByteOffset(bitOffset).okOrElse(fail),
        this.length
      );
      const newBitOffset = bitOffset + toBitLength(value.byteLength);

      return { value, bitOffset: newBitOffset };
    });
  }
}

/**
 * Coder for a sequence of bytes of fixed length. Does not encode the length.
 * This coder essentially reads/writes the bytes directly from/to the buffer
 * without modification.
 */
export function byteArray(length: number): Coder<Uint8Array> {
  return new ByteArrayCoder(length);
}
