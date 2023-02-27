import { integers, zipMin } from '@votingworks/basics';

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.iterator in value
  );
}

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
 *   yield i;
 * }
 *
 * const stream = jsonStream({ foo: [1, 2, 3], bar: generateLargeArray() });
 * const writer = createWriteStream('output.json');
 * for (const chunk of stream) {
 *  writer.write(chunk);
 * }
 * ```
 */
export function* jsonStream(input: unknown, indent = 0): Generator<string> {
  if (input === null) {
    yield 'null';
  } else if (
    typeof input === 'boolean' ||
    typeof input === 'number' ||
    typeof input === 'string'
  ) {
    yield JSON.stringify(input);
  } else if (isIterable(input)) {
    const indentString = ' '.repeat(indent * 2);
    const nextIndent = indent + 1;
    const nextIndentString = ' '.repeat(nextIndent * 2);
    yield '[';
    let isEmpty = true;
    for (const [value, index] of zipMin(input, integers())) {
      isEmpty = false;
      if (index !== 0) {
        yield ',';
      }
      yield `\n${nextIndentString}`;
      yield* jsonStream(value, nextIndent);
    }
    yield isEmpty ? ']' : `\n${indentString}]`;
  } else if (typeof input === 'object') {
    const indentString = ' '.repeat(indent * 2);
    const nextIndent = indent + 1;
    const nextIndentString = ' '.repeat(nextIndent * 2);
    yield '{';
    let isEmpty = true;
    for (const [[key, value], index] of zipMin(
      Object.entries(input),
      integers()
    )) {
      if (value === undefined) {
        continue;
      }

      isEmpty = false;
      if (index !== 0) {
        yield ',';
      }
      yield `\n${nextIndentString}`;
      yield* jsonStream(key, nextIndent);
      yield ': ';
      yield* jsonStream(value, nextIndent);
    }
    yield isEmpty ? '}' : `\n${indentString}}`;
  } else {
    throw new Error(`unknown type ${typeof input}`);
  }
}
