import {
  ok,
  Optional,
  Result,
  safeParse,
  safeParseJSON,
} from '@votingworks/types';
import { fromByteArray, toByteArray } from 'base64-js';
import { z } from 'zod';
import { fetchJSON } from '../fetch_json';
import { Card, CardAPI, CardAPISchema } from '../types';

/**
 * Implements the `Card` API by accessing it through a web service.
 */
export class WebServiceCard implements Card {
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  async readStatus(): Promise<CardAPI> {
    return safeParse(
      CardAPISchema,
      await fetchJSON('/card/read')
    ).unsafeUnwrap();
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const response = await fetch('/card/read_long');
    const { longValue } = await response.json();
    return longValue ? safeParseJSON(longValue, schema) : ok(undefined);
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  async readLongString(): Promise<Optional<string>> {
    const response = await fetch('/card/read_long');
    const { longValue } = await response.json();
    return longValue || undefined;
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    const response = await fetch('/card/read_long_b64');
    const { longValue } = await response.json();
    return longValue ? toByteArray(longValue) : undefined;
  }

  /**
   * Writes a new short value to the card.
   */
  async writeShortValue(value: string): Promise<void> {
    await fetch('/card/write', {
      method: 'post',
      body: value,
      headers: { 'Content-Type': 'application/json' },
    });
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

    await fetch('/card/write_long_b64', {
      method: 'post',
      body: formData,
    });
  }
}
