import { Optional } from '@votingworks/types';

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.iterator in value
  );
}

type WithArraysAsIterables<T> = {
  [P in keyof T]: T[P] extends ReadonlyArray<infer U>
    ? Iterable<U>
    : T[P] extends Optional<ReadonlyArray<infer U>>
    ? Optional<Iterable<U>>
    : T[P];
};

/**
 * Options for {@link jsonStream}.
 */
export interface JsonStreamOptions {
  indentLevel?: number;
  compact?: boolean;
}

/**
 * A JSON-serializable value that can be streamed as a series of strings.
 */
export type JsonStreamInput<T> =
  | WithArraysAsIterables<T>
  | null
  | string
  | number
  | boolean;

/**
 * Stream a JSON-serializable value as a series of strings. In addition to the
 * standard JSON types, this also supports `Iterable` values such as
 * `Generator`.
 *
 * @example
 *
 * ```ts
 * function* generateLargeArray() {
 *   for (let i = 0; i < 1_000_000_000; i++) {
 *     yield i;
 *   }
 * }
 *
 * const stream = jsonStream({ foo: [1, 2, 3], bar: generateLargeArray() });
 * const writer = createWriteStream('output.json');
 * for (const chunk of stream) {
 *  writer.write(chunk);
 * }
 * ```
 */
export function* jsonStream<T>(
  input: JsonStreamInput<T>,
  { compact = true, indentLevel = 0 }: JsonStreamOptions = {}
): Generator<string> {
  if (input === null) {
    yield 'null';
  } else if (
    typeof input === 'boolean' ||
    typeof input === 'number' ||
    typeof input === 'string'
  ) {
    yield JSON.stringify(input);
  } else if (isIterable(input)) {
    const indentString = compact ? '' : `\n${' '.repeat(indentLevel * 2)}`;
    const nextLevel = indentLevel + 1;
    const nextIndentString = compact ? '' : `\n${' '.repeat(nextLevel * 2)}`;
    yield '[';
    let hasEntries = false;
    for (const value of input) {
      if (hasEntries) {
        yield ',';
      } else {
        hasEntries = true;
      }
      yield nextIndentString;
      yield* jsonStream(value as JsonStreamInput<unknown>, {
        compact,
        indentLevel: nextLevel,
      });
    }
    if (hasEntries) {
      yield indentString;
    }
    yield ']';
  } else if (typeof input === 'object') {
    const indentString = compact ? '' : `\n${' '.repeat(indentLevel * 2)}`;
    const nextLevel = indentLevel + 1;
    const nextIndentString = compact ? '' : `\n${' '.repeat(nextLevel * 2)}`;
    yield '{';
    let hasEntries = false;
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) {
        continue;
      }

      if (hasEntries) {
        yield ',';
      } else {
        hasEntries = true;
      }
      yield nextIndentString;
      yield* jsonStream(key, { compact, indentLevel: nextLevel });
      yield compact ? ':' : ': ';
      yield* jsonStream(value as JsonStreamInput<unknown>, {
        compact,
        indentLevel: nextLevel,
      });
    }
    if (hasEntries) {
      yield indentString;
    }
    yield '}';
  } else {
    throw new Error(`unknown type ${typeof input}`);
  }
}
