import { Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BaseCoder } from './base_coder';
import { CoderError, EncodeResult, DecodeResult, Coder } from './types';
import { toBitLength } from './bits';
import { uint8 } from './uint8_coder';

/**
 * Coder for a sequence of bytes of variable length. Encoded with a length
 * followed by the bytes.
 */
export class DynamicBytes extends BaseCoder<Uint8Array> {
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
    return resultBlock((fail) => {
      return (
        this.lengthCoder.bitLength(value.length).okOrElse(fail) +
        toBitLength(value.byteLength)
      );
    });
  }

  encodeInto(
    value: Uint8Array,
    buffer: Buffer,
    bitOffset: number
  ): EncodeResult {
    return resultBlock((fail) => {
      let dataBitOffset = this.lengthCoder
        .encodeInto(value.length, buffer, bitOffset)
        .okOrElse(fail);

      const dataCoder = uint8();

      for (const byte of value) {
        dataBitOffset = dataCoder
          .encodeInto(byte, buffer, dataBitOffset)
          .okOrElse(fail);
      }

      return dataBitOffset;
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<Uint8Array> {
    return resultBlock((fail) => {
      const decodedLength = this.lengthCoder
        .decodeFrom(buffer, bitOffset)
        .okOrElse(fail);

      const dataCoder = uint8();
      const data = new Uint8Array(decodedLength.value);
      let dataBitOffset = decodedLength.bitOffset;

      for (let i = 0; i < decodedLength.value; i += 1) {
        const decodedByte = dataCoder
          .decodeFrom(buffer, dataBitOffset)
          .okOrElse(fail);

        data[i] = decodedByte.value;
        dataBitOffset = decodedByte.bitOffset;
      }

      return { value: data, bitOffset: dataBitOffset };
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
 * import { dynamicBytes, uint8 } from '@votingworks/message-coder';
 *
 * const coder = dynamicBytes(uint8());
 * coder.encode(Uint8Array.from([1, 2, 3]));
 * // => Uint8Array.of(3, 1, 2, 3)
 * //           length ┘  └──┴──┴ data
 * ```
 */
export function dynamicBytes(lengthCoder: Coder<number>): Coder<Uint8Array> {
  return new DynamicBytes(lengthCoder);
}
