import { ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BaseCoder } from './base_coder';
import { LiteralCoder } from './literal_coder';
import { PaddingCoder } from './padding_coder';
import { BitOffset, Coder, DecodeResult, EncodeResult } from './types';

/**
 * Parts of a message coder.
 */
type MessageCoderParts<T> = {
  [K in keyof T]: Coder<T[K]> | LiteralCoder | PaddingCoder;
};
type PropsMatching<T, V> = {
  [P in keyof T]: T[P] extends V ? P : never;
}[keyof T];
type FilterOut<T, V> = Omit<T, PropsMatching<T, V>>;

/**
 * Gets the type encoded by a coder.
 */
export type CoderType<T> = T extends Coder<infer U> ? U : never;

/**
 * Gets the object type encoded by a message coder's parts.
 */
type CoderPartsOperand<T> = T extends MessageCoderParts<infer U> ? U : never;

/**
 * Gets the type of a coder from its parts. Excludes any coders that don't
 * contribute to the JS object.
 */
type CoderFromParts<T> = Coder<
  CoderPartsOperand<FilterOut<T, LiteralCoder | PaddingCoder>>
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

  bitLength(value: ObjectFromParts<P>): number {
    let length = 0;
    for (const [k, v] of Object.entries(this.parts)) {
      const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
      length += coder.bitLength(value[k]);
    }
    return length;
  }

  encodeInto(
    value: ObjectFromParts<P>,
    buffer: Buffer,
    initialBitOffset: BitOffset
  ): EncodeResult {
    let bitOffset = initialBitOffset;

    for (const [k, v] of Object.entries(this.parts)) {
      const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
      const encoded =
        coder instanceof LiteralCoder || coder instanceof PaddingCoder
          ? coder.encodeInto(undefined, buffer, bitOffset)
          : coder.encodeInto(value[k], buffer, bitOffset);
      if (encoded.isErr()) {
        return encoded;
      }
      bitOffset = encoded.ok();
    }

    return ok(bitOffset);
  }

  decodeFrom(
    buffer: Buffer,
    initialBitOffset: BitOffset
  ): DecodeResult<ObjectFromParts<P>> {
    let bitOffset = initialBitOffset;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.parts)) {
      const coder = v as Coder<ObjectFromParts<P>[keyof ObjectFromParts<P>]>;
      const decodeResult = coder.decodeFrom(buffer, bitOffset);
      if (decodeResult.isErr()) {
        return decodeResult;
      }

      const { value, bitOffset: nextOffset } = decodeResult.ok();

      if (
        !(coder instanceof LiteralCoder) &&
        !(coder instanceof PaddingCoder)
      ) {
        result[k] = value;
      }

      bitOffset = nextOffset;
    }

    return ok({ value: result as ObjectFromParts<P>, bitOffset });
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
