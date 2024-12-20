import check8601 from '@antongolub/iso8601';
import { z } from 'zod';
import {
  err,
  ok,
  Optional,
  Result,
  wrapException,
  DateWithoutTime,
} from '@votingworks/basics';

export interface Dictionary<T> {
  [key: string]: Optional<T>;
}
export interface Provider<T> {
  get(): Promise<T>;
}

/**
 * Parse `value` using `parser`. Note that this takes an object that is already
 * supposed to be of type `T`, not a JSON string. For that, use `safeParseJson`.
 *
 * @returns `Ok` when the parse succeeded, `Err` otherwise.
 */
export function safeParse<T>(
  parser: z.ZodType<T>,
  value: unknown
): Result<T, z.ZodError> {
  const result = parser.safeParse(value);

  if (!result.success) {
    return err(result.error);
  }

  return ok(result.data);
}

/**
 * Parse JSON without throwing an exception if it's malformed. On success the
 * result will be `Ok<unknown>` and you'll need to validate the result yourself.
 * Given malformed JSON, the result will be `Err<SyntaxError>`. Add a parser
 * argument to automatically validate the resulting value after deserializing
 * the JSON.
 */
export function safeParseJson(text: string): Result<unknown, SyntaxError>;
/**
 * Parse JSON and then validate the result with `parser`.
 */
export function safeParseJson<T>(
  text: string,
  parser: z.ZodType<T>
): Result<T, z.ZodError | SyntaxError>;
export function safeParseJson<T>(
  text: string,
  parser?: z.ZodType<T>
): Result<T | unknown, z.ZodError | SyntaxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return wrapException(error);
  }

  return parser ? safeParse(parser, parsed) : ok(parsed);
}

/**
 * Parse `value` using `parser` or throw an exception if parsing fails.
 */
export function unsafeParse<T>(parser: z.ZodType<T>, value: unknown): T {
  return safeParse(parser, value).unsafeUnwrap();
}

/**
 * Parser `value` using `parser` or return `undefined` if parsing fails.
 */
export function maybeParse<T>(
  parser: z.ZodType<T>,
  value: unknown
): T | undefined {
  return safeParse(parser, value).ok();
}

declare const Unique: unique symbol;

/**
 * Builds a nominal type based on `Base` with tag `Tag`. This allows creating a
 * type that acts as `Base` but is not assignable from `Base`.
 *
 * @example
 *
 *   type EmailAddress = NewType<string, 'EmailAddress'>;
 *
 *   function parseEmailAddress(emailAddress: string): Optional<EmailAddress> {
 *     if (EMAIL_ADDRESS_PATTERN.test(emailAddress)) {
 *       return emailAddress as EmailAddress;
 *     }
 *     return undefined;
 *   }
 *
 *   declare function sendEmail(to: EmailAddress, subject: string, body: string): Promise<void>;
 *
 *   await sendEmail('admin@example.com', 'Hello', 'World');
 *   //              ^^^^^^^^^^^^^^^^^^^
 *   // Argument of type 'string' is not assignable to parameter of type 'EmailAddress'.
 *
 *   const to = parseEmailAddress('admin@example.com');
 *   assert(to);
 *   await sendEmail(to, 'Hello', 'World');
 */
export type NewType<Base, Tag> = Base & { readonly [Unique]: Tag };

/**
 * Creates a type that is either `T` or a `Promise` wrapping `T`.
 */
export type PromiseOr<T> = T | Promise<T>;

export type Id = string;
export const IdSchema: z.ZodSchema<Id> = z
  .string()
  .nonempty()
  .refine((id) => !id.startsWith('_'), 'IDs may not start with an underscore')
  .refine(
    (id) => /^[-_a-z\d]+$/i.test(id),
    'IDs may only contain letters, numbers, dashes, and underscores'
  );
export const Sha256Hash: z.ZodSchema<string> = z
  .string()
  .nonempty()
  .refine(
    (hash) => /^[0-9a-f]*$/i.test(hash),
    'Hashes must be hex strings containing only 0-9 and a-f'
  );
export const MachineId = z
  .string()
  .nonempty()
  .refine(
    (id) => /^[-A-Z\d]+$/.test(id),
    'Machine IDs may only contain numbers, uppercase letters, and dashes'
  );

export const Iso8601DateTimeSchema = z
  .string()
  .refine(check8601, 'datetimes must be in ISO8601 format');
export type Iso8601Timestamp = string;
export const Iso8601TimestampSchema = Iso8601DateTimeSchema;

export const DateWithoutTimeSchema = z.instanceof(DateWithoutTime);
