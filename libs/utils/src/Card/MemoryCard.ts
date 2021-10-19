import { ok, Optional, Result, safeParseJSON } from '@votingworks/types';
import { z } from 'zod';
import { Card, CardAPI } from '../types';

/**
 * Implements the `Card` API with an in-memory implementation.
 */
export default class MemoryCard implements Card {
  private present = false;

  private shortValue?: string;

  private longValue?: Uint8Array;

  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  async readStatus(): Promise<CardAPI> {
    const { present, shortValue } = this;

    if (present) {
      const longValueExists =
        typeof this.longValue !== 'undefined' && this.longValue.length > 0;

      return {
        present,
        shortValue,
        longValueExists,
      };
    }
    return { present };
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const { longValue } = this;
    if (!longValue || longValue.length === 0) {
      return ok(undefined);
    }

    const longValueJSON = new TextDecoder().decode(longValue);
    return safeParseJSON(longValueJSON, schema);
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  async readLongString(): Promise<Optional<string>> {
    const { longValue } = this;

    if (!longValue) {
      return;
    }

    return new TextDecoder().decode(longValue);
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    return this.longValue;
  }

  /**
   * Writes a new short value to the card.
   */
  async writeShortValue(value: string): Promise<void> {
    if (!this.present) {
      throw new Error('cannot write short value when no card is present');
    }

    this.shortValue = value;
  }

  /**
   * Writes a new long value as a serialized object.
   */
  async writeLongObject(value: unknown): Promise<void> {
    await this.writeLongUint8Array(
      new TextEncoder().encode(JSON.stringify(value))
    );
  }

  /**
   * Writes binary data to the long value.
   */
  async writeLongUint8Array(value: Uint8Array): Promise<void> {
    if (!this.present) {
      throw new Error('cannot write long value when no card is present');
    }

    this.longValue = Uint8Array.from(value);
  }

  /**
   * Removes the simulated in-memory card.
   */
  removeCard(): this {
    this.present = false;
    this.shortValue = undefined;
    this.longValue = undefined;
    return this;
  }

  /**
   * Inserts a simulated in-memory card with specified long and short values.
   */
  insertCard(
    shortValue?: string | unknown,
    longValue?: string | Uint8Array
  ): this {
    this.shortValue =
      typeof shortValue === 'string' ? shortValue : JSON.stringify(shortValue);
    this.longValue =
      typeof longValue === 'undefined'
        ? undefined
        : longValue instanceof Uint8Array
        ? Uint8Array.from(longValue)
        : new TextEncoder().encode(longValue);
    this.present = true;
    return this;
  }
}
