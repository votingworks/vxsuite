import { ok, Optional, Result, safeParseJson } from '@votingworks/types';
import { z } from 'zod';
import { Card, CardSummary } from '../types';

/* eslint-disable @typescript-eslint/require-await */

/**
 * Implements the `Card` API with an in-memory implementation.
 */
export class MemoryCard implements Card {
  private status: CardSummary['status'] = 'no_card';

  private shortValue?: string;

  private longValue?: Uint8Array;

  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  async readSummary(): Promise<CardSummary> {
    const { status, shortValue } = this;

    if (status === 'ready') {
      const longValueExists =
        typeof this.longValue !== 'undefined' && this.longValue.length > 0;

      return {
        status,
        shortValue,
        longValueExists,
      };
    }
    return { status };
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

    const longValueJson = new TextDecoder().decode(longValue);
    return safeParseJson(longValueJson, schema);
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
    if (this.status !== 'ready') {
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
    if (this.status !== 'ready') {
      throw new Error('cannot write long value when no card is present');
    }

    this.longValue = Uint8Array.from(value);
  }

  /**
   * Removes the simulated in-memory card.
   */
  removeCard(): this {
    this.status = 'no_card';
    this.shortValue = undefined;
    this.longValue = undefined;
    return this;
  }

  /**
   * Inserts a simulated in-memory card with specified long and short values.
   */
  insertCard(
    shortValue?: string | unknown,
    longValue?: string | Uint8Array,
    status: 'ready' | 'error' = 'ready'
  ): this {
    this.shortValue =
      typeof shortValue === 'string' ? shortValue : JSON.stringify(shortValue);
    this.longValue =
      typeof longValue === 'undefined'
        ? undefined
        : longValue instanceof Uint8Array
        ? Uint8Array.from(longValue)
        : new TextEncoder().encode(longValue);
    this.status = status;
    return this;
  }
}
