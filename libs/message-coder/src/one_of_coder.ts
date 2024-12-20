import { Buffer } from 'node:buffer';
import { Result, assert, err } from '@votingworks/basics';
import { BaseCoder } from './base_coder';
import {
  BitLength,
  Coder,
  CoderError,
  DecodeResult,
  EncodeResult,
} from './types';
import { CoderType } from './message_coder';

/**
 * A coder that encodes/decodes one of a set of coders.
 */
export class OneOfCoder<T> extends BaseCoder<T> {
  constructor(private readonly coders: ReadonlyArray<Coder<T>>) {
    super();
  }

  /**
   * Determines whether a value can be encoded by trying each coder in turn.
   */
  canEncode(value: unknown): value is T {
    return this.coders.some((coder) => coder.canEncode(value));
  }

  /**
   * Returns the default value of the first coder.
   */
  default(): T {
    const [coder] = this.coders;
    assert(coder !== undefined);
    return coder.default();
  }

  /**
   * Returns the bit length of a value by trying each coder in turn.
   */
  bitLength(value: T): Result<BitLength, CoderError> {
    for (const coder of this.coders) {
      if (!coder.canEncode(value)) {
        continue;
      }

      return coder.bitLength(value);
    }

    return err('InvalidValue');
  }

  /**
   * Encodes a value into a buffer by trying each coder in turn.
   */
  encodeInto(value: T, buffer: Buffer, bitOffset: number): EncodeResult {
    for (const coder of this.coders) {
      if (!coder.canEncode(value)) {
        continue;
      }

      return coder.encodeInto(value, buffer, bitOffset);
    }

    return err('InvalidValue');
  }

  /**
   * Decodes a value from a buffer by trying each coder in turn.
   */
  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<T> {
    for (const coder of this.coders) {
      const result = coder.decodeFrom(buffer, bitOffset);
      if (result.isOk()) {
        return result;
      }
    }

    return err('InvalidValue');
  }
}

/**
 * Builds a coder that encodes/decodes one of a set of coders. Each coder is
 * tried in turn until one succeeds. It's simplest to provide coders whose types
 * are incompatible with each other so that only one can succeed. If multiple
 * coders can encode a value, the first one is used. This may not be the one you
 * expect, but if the coder types are discriminated based on a `literal` then
 * you can provide the literal value to ensure the correct coder is used.
 *
 * @example
 *
 * ```ts
 * const HorizontalSettings = message({
 *   type: literal('horizontal'),
 *   resolution: uint16(),
 * });
 * const VerticalSettings = message({
 *  type: literal('vertical'),
 *  resolution: uint16(),
 * });
 *
 * const Settings = oneOf(HorizontalSettings, VerticalSettings);
 *
 * // implicitly uses `HorizontalSettings` since it's first and both match
 * const encoded1 = Settings.encode({ resolution: 1024 });
 *
 * // explicitly uses `VerticalSettings` because `type` is provided
 * const encoded2 = Settings.encode({ type: 'vertical', resolution: 768 });
 *
 * // explicitly uses `HorizontalSettings` because `type` is provided
 * const encoded3 = Settings.encode({ type: 'horizontal', resolution: 1024 });
 * ```
 */
export function oneOf<T extends Array<Coder<unknown>>>(
  ...coders: T
): Coder<CoderType<T>> {
  return new OneOfCoder<CoderType<T>>(
    coders as ReadonlyArray<Coder<CoderType<T>>>
  );
}
