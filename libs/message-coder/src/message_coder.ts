import { Result, resultBlock } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { BaseCoder } from './base_coder';
import { LiteralCoder } from './literal_coder';
import { PaddingCoder } from './padding_coder';
import {
  BitLength,
  BitOffset,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';

/**
 * Parts of a message coder.
 */
type MessageCoderParts<T> = {
  [K in keyof T]:
    | Coder<T[K]>
    | LiteralCoder<Array<string | number | Buffer>>
    | PaddingCoder;
};
type PropsMatching<T, V> = {
  [P in keyof T]: T[P] extends V ? P : never;
}[keyof T];
type FilterOut<T, V> = Omit<T, PropsMatching<T, V>>;
type MakeOptional<T, V> = Omit<T, PropsMatching<T, V>> &
  Partial<Pick<T, PropsMatching<T, V>>>;

/**
 * Gets the type encoded by a coder.
 */
export type CoderType<T> = T extends Coder<infer U>
  ? U
  : T extends [infer Head, ...infer Tail]
  ? CoderType<Head> | CoderType<Tail>
  : never;

/**
 * Gets the object type encoded by a message coder's parts.
 */
type CoderPartsOperand<T> = T extends MessageCoderParts<infer U> ? U : never;

/**
 * Gets the type of a coder from its parts. Excludes any coders that don't
 * contribute to the JS object.
 */
type CoderFromParts<T> = Coder<
  CoderPartsOperand<
    MakeOptional<
      FilterOut<T, PaddingCoder>,
      LiteralCoder<Array<string | number | Buffer>>
    >
  >
>;

/**
 * Gets the type of an object from its coder parts.
 */
type ObjectFromParts<T> = T extends MessageCoderParts<infer U>
  ? CoderType<U>
  : never;

/**
 * Builds a message encoder/decoder from a sequence of named fields and literal
 * values. The fields are encoded in the order they are specified in the
 * object.
 *
 * @example
 *
 * ```ts
 * const coder = new MessageCoder({
 *  foo: uint8(),
 *  bar: literal(0x00),
 *  baz: uint16(),
 * });
 *
 * const buffer = coder.encode({ foo: 0x01, baz: 0x0203 }).ok();
 * // buffer is now <Buffer 01 00 03 02>
 * //                       │  │  │  │
 * //                       │  │  │  │
 * //                       │  │  │  └── baz (MSB)
 * //                       │  │  └───── baz (LSB)
 * //                       │  └──────── bar
 * //                       └─────────── foo
 * ```
 */
class MessageCoder<P extends MessageCoderParts<object>>
  extends BaseCoder<ObjectFromParts<P>>
  implements CoderFromParts<P>
{
  constructor(private readonly parts: P) {
    super();
  }

  canEncode(value: unknown): value is ObjectFromParts<P> {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    for (const [k, v] of Object.entries(this.parts)) {
      const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
      if (coder instanceof PaddingCoder) {
        continue;
      }

      if (!coder.canEncode((value as ObjectFromParts<P>)[k as keyof P])) {
        return false;
      }
    }
    return true;
  }

  default(): ObjectFromParts<P> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.parts)) {
      const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
      if (coder instanceof PaddingCoder) {
        continue;
      }

      result[k] = coder.default();
    }
    return result as ObjectFromParts<P>;
  }

  bitLength(value: ObjectFromParts<P>): Result<BitLength, CoderError> {
    return resultBlock((fail) => {
      let length = 0;
      for (const [k, v] of Object.entries(this.parts)) {
        const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
        length += coder.bitLength(value[k as keyof P]).okOrElse(fail);
      }
      return length;
    });
  }

  encodeInto(
    value: ObjectFromParts<P>,
    buffer: Buffer,
    initialBitOffset: BitOffset
  ): EncodeResult {
    return resultBlock((fail) => {
      let bitOffset = initialBitOffset;

      for (const [k, v] of Object.entries(this.parts)) {
        const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
        bitOffset = (
          coder instanceof PaddingCoder
            ? coder.encodeInto(undefined, buffer, bitOffset)
            : coder.encodeInto(value[k as keyof P], buffer, bitOffset)
        ).okOrElse(fail);
      }

      return bitOffset;
    });
  }

  decodeFrom(
    buffer: Buffer,
    initialBitOffset: BitOffset
  ): DecodeResult<ObjectFromParts<P>> {
    return resultBlock((fail) => {
      let bitOffset = initialBitOffset;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(this.parts)) {
        const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
        const { value, bitOffset: nextOffset } = coder
          .decodeFrom(buffer, bitOffset)
          .okOrElse(fail);

        if (
          !(coder instanceof LiteralCoder) &&
          !(coder instanceof PaddingCoder)
        ) {
          result[k] = value;
        }

        bitOffset = nextOffset;
      }

      return { value: result as ObjectFromParts<P>, bitOffset };
    });
  }
}

/**
 * Builds a message encoder/decoder from a sequence of named fields and literal
 * values. The fields are encoded in the order they are specified in the
 * object.
 *
 * @example
 *
 * ```ts
 * const coder = message({
 *  foo: uint8(),
 *  bar: literal(0x00),
 *  baz: uint16(),
 * });
 *
 * const buffer = coder.encode({ foo: 0x01, baz: 0x0203 }).ok();
 * // buffer is now <Buffer 01 00 03 02>
 * //                       │  │  │  │
 * //                       │  │  │  │
 * //                       │  │  │  └── baz (MSB)
 * //                       │  │  └───── baz (LSB)
 * //                       │  └──────── bar
 * //                       └─────────── foo
 * ```
 */
export function message<P extends MessageCoderParts<object>>(
  parts: P
): CoderFromParts<P> {
  return new MessageCoder(parts);
}
