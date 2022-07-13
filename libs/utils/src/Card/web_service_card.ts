import {
  ok,
  Optional,
  Result,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import { fromByteArray, toByteArray } from 'base64-js';
import { z } from 'zod';
import { fetchJson } from '../fetch_json';
import { Card, CardSummary, CardSummarySchema } from '../types';

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
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  async readSummary(): Promise<CardSummary> {
    return unsafeParse(CardSummarySchema, await fetchJson('/card/read'));
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const { longValue } = (await fetchJson(
      '/card/read_long'
    )) as LongValueResponse;
    return longValue ? safeParseJson(longValue, schema) : ok(undefined);
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  async readLongString(): Promise<Optional<string>> {
    const { longValue } = (await fetchJson(
      '/card/read_long'
    )) as LongValueResponse;
    return longValue || undefined;
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    const { longValue } = (await fetchJson(
      '/card/read_long_b64'
    )) as LongValueResponse;
    return longValue ? toByteArray(longValue) : undefined;
  }

  /**
   * Writes a new short value to the card.
   */
  async writeShortValue(value: string): Promise<void> {
    const { success } = (await fetchJson('/card/write', {
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
    const formData = new FormData();

    formData.append('long_value', longValueBase64);

    const { success } = (await fetchJson('/card/write_long_b64', {
      method: 'post',
      body: formData,
    })) as SuccessIndicationResponse;
    if (!success) {
      throw new Error('Failed to write long value');
    }
  }
}
