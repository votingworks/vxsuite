import { z } from 'zod';
import { Result } from '@votingworks/basics';
import { Optional } from './generic';

export interface CardSummaryNotReady {
  status: 'no_card' | 'error';
}
export interface CardSummaryReady {
  status: 'ready';
  shortValue?: string;
  longValueExists?: boolean;
}
export type CardSummary = CardSummaryNotReady | CardSummaryReady;

export const CardSummaryNotReadySchema: z.ZodSchema<CardSummaryNotReady> =
  z.object({
    status: z.enum(['no_card', 'error']),
  });
export const CardSummaryReadySchema: z.ZodSchema<CardSummaryReady> = z.object({
  status: z.literal('ready'),
  shortValue: z.string().optional(),
  longValueExists: z.boolean().optional(),
});
export const CardSummarySchema: z.ZodSchema<CardSummary> = z.union([
  CardSummaryNotReadySchema,
  CardSummaryReadySchema,
]);

export interface ShortAndLongValues {
  shortValue: string;
  longValue: string;
}

/**
 * Defines the API for accessing a smart card reader.
 */
export interface Card {
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  readSummary(): Promise<CardSummary>;

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>>;

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  readLongString(): Promise<Optional<string>>;

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  readLongUint8Array(): Promise<Optional<Uint8Array>>;

  /**
   * Writes a new short value to the card.
   */
  writeShortValue(value: string): Promise<void>;

  /**
   * Writes a new long value as a serialized object.
   */
  writeLongObject(value: unknown): Promise<void>;

  /**
   * Writes binary data to the long value.
   */
  writeLongUint8Array(value: Uint8Array): Promise<void>;

  /**
   * Writes new short and long values to the card.
   */
  writeShortAndLongValues(values: ShortAndLongValues): Promise<void>;

  /**
   * Overrides card write protection.
   */
  overrideWriteProtection(): Promise<void>;
}
