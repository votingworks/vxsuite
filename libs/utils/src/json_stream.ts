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
  { compact = true }: JsonStreamOptions = {}
): Generator<string> {
  const visitedObjects = new WeakSet();

  function* jsonStreamInternal(
    value: unknown,
    indentLevel = 0
  ): Generator<string> {
    if (value === null) {
      yield 'null';
    } else if (
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      yield JSON.stringify(value);
    } else if (isIterable(value)) {
      if (visitedObjects.has(value)) {
        throw new Error('circular reference');
      }
      visitedObjects.add(value);

      const indentString = compact ? '' : `\n${' '.repeat(indentLevel * 2)}`;
      const nextLevel = indentLevel + 1;
      const nextIndentString = compact ? '' : `\n${' '.repeat(nextLevel * 2)}`;
      yield '[';
      let hasEntries = false;
      for (const entry of value) {
        if (hasEntries) {
          yield ',';
        } else {
          hasEntries = true;
        }
        yield nextIndentString;
        yield* jsonStreamInternal(entry, nextLevel);
      }
      if (hasEntries) {
        yield indentString;
      }
      yield ']';
    } else if (typeof value === 'object') {
      if (visitedObjects.has(value)) {
        throw new Error('circular reference');
      }
      visitedObjects.add(value);

      const indentString = compact ? '' : `\n${' '.repeat(indentLevel * 2)}`;
      const nextLevel = indentLevel + 1;
      const nextIndentString = compact ? '' : `\n${' '.repeat(nextLevel * 2)}`;
      yield '{';
      let hasEntries = false;
      for (const [key, val] of Object.entries(value)) {
        if (val === undefined) {
          continue;
        }

        if (hasEntries) {
          yield ',';
        } else {
          hasEntries = true;
        }
        yield nextIndentString;
        yield* jsonStreamInternal(key, nextLevel);
        yield compact ? ':' : ': ';
        yield* jsonStreamInternal(val, nextLevel);
      }
      if (hasEntries) {
        yield indentString;
      }
      yield '}';
    } else {
      throw new Error(`cannot serialize type '${typeof value}'`);
    }
  }

  yield* jsonStreamInternal(input);
}
