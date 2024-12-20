// allow multiple variants of `byteArray` within the same file
/* eslint-disable max-classes-per-file */

import { Result, err, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { CoderError, EncodeResult, DecodeResult, Coder } from './types';
import { BITS_PER_BYTE, toBitLength } from './bits';
import { uint8 } from './uint8_coder';
import { uint16 } from './uint16_coder';
import { byteArray } from './byte_array';

/**
 * Coder for a sequence of bytes of variable length. Encoded with a length
 * followed by the bytes.
 */
class VariableLengthByteArrayCoder extends BaseCoder<Uint8Array> {
  constructor(private readonly lengthCoder: Coder<number>) {
    super();
  }

  canEncode(value: unknown): value is Uint8Array {
    return (
      value instanceof Uint8Array && this.lengthCoder.canEncode(value.length)
    );
  }

  default(): Uint8Array {
    return new Uint8Array();
  }

  bitLength(value: Uint8Array): Result<number, CoderError> {
    return resultBlock(
      (fail) =>
        this.lengthCoder.bitLength(value.length).okOrElse(fail) +
        toBitLength(value.byteLength)
    );
  }

  encodeInto(
    value: Uint8Array,
    buffer: Buffer,
    bitOffset: number
  ): EncodeResult {
    return resultBlock((fail) => {
      const dataBitOffset = this.lengthCoder
        .encodeInto(value.length, buffer, bitOffset)
        .okOrElse(fail);

      return byteArray(value.byteLength).encodeInto(
        value,
        buffer,
        dataBitOffset
      );
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<Uint8Array> {
    return resultBlock((fail) => {
      const decodedLength = this.lengthCoder
        .decodeFrom(buffer, bitOffset)
        .okOrElse(fail);
      return byteArray(decodedLength.value).decodeFrom(
        buffer,
        decodedLength.bitOffset
      );
    });
  }
}

/**
 * Coder for a sequence of bytes of fixed length. Encoded with a length followed
 * by the bytes.
 */
class FixedLengthByteArrayCoder extends BaseCoder<Uint8Array> {
  private readonly lengthCoder: Coder<number>;
  private readonly byteArrayCoder: Coder<Uint8Array>;

  constructor(private readonly length: number) {
    super();

    const bytesRequired = Math.ceil(Math.log2(length + 1) / BITS_PER_BYTE);

    // we only support uint16 and smaller for now,
    // because otherwise the buffer sizes get too large
    switch (bytesRequired) {
      case 1:
        this.lengthCoder = uint8();
        break;

      case 2:
        this.lengthCoder = uint16();
        break;

      default:
        throw new Error(
          `byteArrayWithLengthPrefix() does not support length of ${length}`
        );
    }

    this.byteArrayCoder = byteArray(length);
  }

  canEncode(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array && value.length === this.length;
  }

  default(): Uint8Array {
    return new Uint8Array(this.length);
  }

  bitLength(value: Uint8Array): Result<number, CoderError> {
    return resultBlock((fail) =>
      this.canEncode(value)
        ? this.lengthCoder.bitLength(value.length).okOrElse(fail) +
          this.byteArrayCoder.bitLength(value).okOrElse(fail)
        : err('InvalidValue')
    );
  }

  encodeInto(
    value: Uint8Array,
    buffer: Buffer,
    bitOffset: number
  ): EncodeResult {
    return resultBlock((fail) => {
      if (!this.canEncode(value)) {
        return fail('InvalidValue');
      }

      const nextBitOffset = this.lengthCoder
        .encodeInto(value.length, buffer, bitOffset)
        .okOrElse(fail);
      return this.byteArrayCoder.encodeInto(value, buffer, nextBitOffset);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<Uint8Array> {
    return resultBlock((fail) => {
      const decodedLength = this.lengthCoder
        .decodeFrom(buffer, bitOffset)
        .okOrElse(fail);

      if (decodedLength.value !== this.length) {
        return err('InvalidValue');
      }

      const decoded = this.byteArrayCoder
        .decodeFrom(buffer, decodedLength.bitOffset)
        .okOrElse(fail);

      return decoded;
    });
  }
}

/**
 * Creates a coder for a sequence of bytes of variable length. Encoded with a
 * length followed by the bytes.
 *
 * @param lengthCoder Coder for the length of the sequence. Determines the
 *                    maximum length of the sequence, e.g. `uint8()` for a
 *                    maximum length of 255 bytes.
 *
 * @example
 *
 * ```ts
 * import { byteArrayWithLengthPrefix, uint8 } from '@votingworks/message-coder';
 *
 * const coder = byteArrayWithLengthPrefix(uint8());
 * coder.encode(Uint8Array.from([1, 2, 3]));
 * // => Uint8Array.of(3, 1, 2, 3)
 * //           length ┘  └──┴──┴ data
 * ```
 */
export function byteArrayWithLengthPrefix(
  lengthCoder: Coder<number>
): Coder<Uint8Array>;

/**
 * Creates a coder for a sequence of bytes of fixed length. Encoded with the
 * fixed length followed by the bytes.
 *
 * @param length A fixed length for the sequence of bytes. Determines the
 *               bytes required for the length automatically, e.g. 255 or less
 *               for a 1-byte length, 256 to 65535 for a 2-byte length. Longer
 *               lengths are not supported. If you must encode longer lengths,
 *               use `byteArrayWithLengthPrefix()` with a `uint24()` or `uint32()` length coder.
 *
 * @example
 *
 * ```ts
 * import { byteArrayWithLengthPrefix, uint8 } from '@votingworks/message-coder';
 *
 * const coder = byteArrayWithLengthPrefix(64);
 * coder.encode(randomBytes(64));
 * // => Uint8Array.of(64, …)
 * //            length ┘  └ data
 * ```
 */
export function byteArrayWithLengthPrefix(length: number): Coder<Uint8Array>;

/**
 * Creates a coder for a sequence of bytes of fixed or variable length.
 */
export function byteArrayWithLengthPrefix(
  lengthCoderOrLength: Coder<number> | number
): Coder<Uint8Array> {
  return typeof lengthCoderOrLength === 'number'
    ? new FixedLengthByteArrayCoder(lengthCoderOrLength)
    : new VariableLengthByteArrayCoder(lengthCoderOrLength);
}
