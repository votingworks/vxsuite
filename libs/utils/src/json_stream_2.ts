import { Optional } from '@votingworks/basics';

type MaybeAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;

function isIterable(value: unknown): value is MaybeAsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Symbol.iterator in value || Symbol.asyncIterator in value)
  );
}

type WithArraysAsIterables<T> = T extends ReadonlyArray<infer U>
  ? MaybeAsyncIterable<WithArraysAsIterables<U>>
  : T extends Optional<ReadonlyArray<infer U>>
  ? Optional<MaybeAsyncIterable<WithArraysAsIterables<U>>>
  : T extends object
  ? { [P in keyof T]: WithArraysAsIterables<T[P]> }
  : T;

/**
 * Options for {@link jsonStream2}.
 */
export interface JsonStream2Options {
  compact?: boolean;
}

/**
 * A JSON-serializable value that can be streamed as a series of strings.
 */
export type JsonStream2Input<T> =
  | WithArraysAsIterables<T>
  | null
  | string
  | number
  | boolean;

export class RawJson {
  // eslint-disable-next-line vx/gts-no-public-class-fields
  constructor(public contents: string) {}
}

/**
 * Stream a JSON-serializable value as a series of strings. In addition to the
 * standard JSON types, this also supports `Iterable` values such as
 * `Generator`.
 *
 * @example
 *
 * ```ts
 * import { createWriteStream } from 'node:fs';
 * import { Readable } from 'node:stream';
 *
 * function* generateLargeArray() {
 *   for (let i = 0; i < 1_000_000_000; i++) {
 *     yield i;
 *   }
 * }
 *
 * Readable.from(jsonStream2({ foo: [1, 2, 3], bar: generateLargeArray() })).pipe(
 *   createWriteStream('output.json')
 * );
 * ```
 */
export async function* jsonStream2<T>(
  input: JsonStream2Input<T>,
  { compact = true }: JsonStream2Options = {}
): AsyncGenerator<string> {
  async function* jsonStream2Internal(
    value: unknown,
    indentLevel: number,
    ancestorObjects: ReadonlySet<unknown>
  ): AsyncGenerator<string> {
    if (ancestorObjects.has(value)) {
      throw new Error('circular reference');
    }

    if (typeof (value as { toJSON?: () => unknown })?.toJSON === 'function') {
      const nextAncestorObjects = new Set(ancestorObjects).add(value);
      return yield* jsonStream2Internal(
        (value as { toJSON(): unknown }).toJSON(),
        indentLevel,
        nextAncestorObjects
      );
    }

    if (value === null) {
      yield 'null';
    } else if (value instanceof RawJson) {
      yield value.contents;
    } else if (
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      yield JSON.stringify(value);
    } else if (isIterable(value)) {
      const nextAncestorObjects = new Set(ancestorObjects).add(value);
      const indentString = compact ? '' : `\n${' '.repeat(indentLevel * 2)}`;
      const nextLevel = indentLevel + 1;
      const nextIndentString = compact ? '' : `\n${' '.repeat(nextLevel * 2)}`;
      yield '[';
      let hasEntries = false;
      for await (const entry of value) {
        if (hasEntries) {
          yield ',';
        } else {
          hasEntries = true;
        }
        yield nextIndentString;
        yield* jsonStream2Internal(entry, nextLevel, nextAncestorObjects);
      }
      if (hasEntries) {
        yield indentString;
      }
      yield ']';
    } else if (typeof value === 'object') {
      const nextAncestorObjects = new Set(ancestorObjects).add(value);
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
        yield* jsonStream2Internal(key, nextLevel, nextAncestorObjects);
        yield compact ? ':' : ': ';
        yield* jsonStream2Internal(val, nextLevel, nextAncestorObjects);
      }
      if (hasEntries) {
        yield indentString;
      }
      yield '}';
    } else {
      throw new Error(`cannot serialize type '${typeof value}'`);
    }
  }

  yield* jsonStream2Internal(input, 0, new Set());
}
