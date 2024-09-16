import { Optional, Result, err, ok, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { toBitLength, toByteOffset } from './bits';
import {
  BitLength,
  BitOffset,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

function concatLiteralParts<T extends Array<string | number | Buffer>>(
  ...values: T
): Buffer {
  return Buffer.concat(
    values.map((v) =>
      typeof v === 'string'
        ? Buffer.from(v)
        : Buffer.isBuffer(v)
        ? v
        : Buffer.of(v)
    )
  );
}

/**
 * A literal value in a message.
 */
export class LiteralCoder<
  T extends ReadonlyArray<string | number | Buffer>,
> extends BaseCoder<Optional<T>> {
  private readonly values: T;
  private readonly value: Buffer;

  constructor(...values: T) {
    super();
    this.values = values;
    this.value = concatLiteralParts(...values);
  }

  canEncode(value: unknown): value is T {
    if (typeof value === 'undefined') {
      return true;
    }

    const parts = Array.isArray(value) ? value : [value];
    const buffer = concatLiteralParts(...parts);
    return Buffer.compare(this.value, buffer) === 0;
  }

  default(): Optional<T> {
    return this.values;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(toBitLength(this.value.byteLength));
  }

  encodeInto(
    value: Optional<T>,
    buffer: Buffer,
    bitOffset: BitOffset
  ): EncodeResult {
    if (!this.canEncode(value)) {
      return err('InvalidValue');
    }

    return resultBlock((fail) => {
      const byteOffset = toByteOffset(bitOffset).okOrElse(fail);
      buffer.set(this.value, byteOffset);
      return toBitLength(byteOffset + this.value.byteLength);
    });
  }

  decodeFrom(buffer: Buffer, bitOffset: BitOffset): DecodeResult<Optional<T>> {
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
export function literal<T extends ReadonlyArray<string | number | Buffer>>(
  ...values: T
): LiteralCoder<T> {
  return new LiteralCoder(...values);
}
