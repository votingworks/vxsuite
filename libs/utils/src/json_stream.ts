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
    let hasEntries = false;
    for (const value of input) {
      if (hasEntries) {
        yield ',';
      } else {
        hasEntries = true;
      }
      yield `\n${nextIndentString}`;
      yield* jsonStream(value, nextIndent);
    }
    yield !hasEntries ? ']' : `\n${indentString}]`;
  } else if (typeof input === 'object') {
    const indentString = ' '.repeat(indent * 2);
    const nextIndent = indent + 1;
    const nextIndentString = ' '.repeat(nextIndent * 2);
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
      yield `\n${nextIndentString}`;
      yield* jsonStream(key, nextIndent);
      yield ': ';
      yield* jsonStream(value, nextIndent);
    }
    yield !hasEntries ? '}' : `\n${indentString}}`;
  } else {
    throw new Error(`unknown type ${typeof input}`);
  }
}
