import { err, resultBlock } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BaseCoder } from './base_coder';
import { toBitLength, toByteOffset } from './bits';
import { BitOffset, DecodeResult, EncodeResult } from './types';

/**
 * A literal value in a message.
 */
export class LiteralCoder extends BaseCoder<void> {
  private readonly value: Buffer;

  constructor(...values: Array<string | number | Buffer>) {
    super();
    this.value = Buffer.concat(
      values.map((v) =>
        typeof v === 'string'
          ? Buffer.from(v)
          : Buffer.isBuffer(v)
          ? v
          : Buffer.of(v)
      )
    );
  }

  default(): void {
    return undefined;
  }

  bitLength(): number {
    return toBitLength(this.value.byteLength);
  }

  encodeInto(_value: void, buffer: Buffer, bitOffset: BitOffset): EncodeResult {
    return resultBlock((fail) => {
      const { value } = this;
      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      buffer.set(value, byteOffset);
      return toBitLength(byteOffset + value.byteLength);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<void> {
    return resultBlock((fail) => {
      const { value } = this;
      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      const data = buffer.slice(byteOffset, byteOffset + value.byteLength);
      if (!data.equals(value)) {
        return err('InvalidValue');
      }
      return {
        value: undefined,
        bitOffset: toBitLength(byteOffset + value.byteLength),
      };
    });
  }
}

/**
 * A literal value in a message. For use with `message` when a section of the
 * message's memory is always a fixed value.
 */
export function literal(
  ...values: Array<string | number | Buffer>
): LiteralCoder {
  return new LiteralCoder(...values);
}
