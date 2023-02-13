import { Result, ok } from '@votingworks/basics';
import {
  Card,
  CardSummary,
  CardSummarySchema,
  Optional,
  safeParseJson,
  ShortAndLongValues,
  unsafeParse,
} from '@votingworks/types';
import { fromByteArray, toByteArray } from 'base64-js';
import { z } from 'zod';
import { fetchJson } from '../fetch_json';

interface LongValueResponse {
  longValue?: string;
}

interface SuccessIndicationResponse {
  success: boolean;
}

/**
 * Implements the `Card` API by accessing it through a web service.
 */
export class WebServiceCard implements Card {
  private readonly baseUrl: string;

  constructor({ baseUrl }: { baseUrl?: string } = {}) {
    this.baseUrl = baseUrl ?? '';
  }

  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  async readSummary(): Promise<CardSummary> {
    return unsafeParse(
      CardSummarySchema,
      await fetchJson(`${this.baseUrl}/card/read`)
    );
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const { longValue } = (await fetchJson(
      `${this.baseUrl}/card/read_long`
    )) as LongValueResponse;
    return longValue ? safeParseJson(longValue, schema) : ok(undefined);
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  async readLongString(): Promise<Optional<string>> {
    const { longValue } = (await fetchJson(
      `${this.baseUrl}/card/read_long`
    )) as LongValueResponse;
    return longValue || undefined;
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    const { longValue } = (await fetchJson(
      `${this.baseUrl}/card/read_long_b64`
    )) as LongValueResponse;
    return longValue ? toByteArray(longValue) : undefined;
  }

  /**
   * Writes a new short value to the card.
   */
  async writeShortValue(value: string): Promise<void> {
    const { success } = (await fetchJson(`${this.baseUrl}/card/write`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: value,
    })) as SuccessIndicationResponse;
    if (!success) {
      throw new Error('Failed to write short value');
    }
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
    const longValueBase64 = fromByteArray(value);
    const { success } = (await fetchJson(
      `${this.baseUrl}/card/write_long_b64`,
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: `long_value=${encodeURIComponent(longValueBase64)}`,
      }
    )) as SuccessIndicationResponse;
    if (!success) {
      throw new Error('Failed to write long value');
    }
  }

  /**
   * Writes new short and long values to the card.
   */
  async writeShortAndLongValues({
    shortValue,
    longValue,
  }: ShortAndLongValues): Promise<void> {
    const { success } = (await fetchJson(
      `${this.baseUrl}/card/write_short_and_long`,
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body:
          `short_value=${encodeURIComponent(shortValue)}&` +
          `long_value=${encodeURIComponent(longValue)}`,
      }
    )) as SuccessIndicationResponse;
    if (!success) {
      throw new Error('Failed to write short and long values');
    }
  }

  /**
   * Overrides card write protection.
   */
  async overrideWriteProtection(): Promise<void> {
    const { success } = (await fetchJson(
      `${this.baseUrl}/card/write_protect_override`,
      {
        method: 'post',
      }
    )) as SuccessIndicationResponse;
    if (!success) {
      throw new Error('Failed to override write protection');
    }
  }
}
