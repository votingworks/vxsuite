import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { iter } from './iter';
import { lines } from './lines';

test('lines (sync)', () => {
  expect(lines('').toArray()).toEqual(['']);
  expect(lines('a').toArray()).toEqual(['a']);
  expect(lines('a\nb').toArray()).toEqual(['a', 'b']);
  expect(lines(Buffer.from('a\nb')).toArray()).toEqual(['a', 'b']);
  expect(lines([{ toString: () => 'a\nb' }]).toArray()).toEqual(['a', 'b']);
  expect(lines(iter([])).toArray()).toEqual([]);
  expect(lines(iter([''])).toArray()).toEqual(['']);
  expect(lines(iter(['\n'])).toArray()).toEqual(['', '']);
  expect(lines(iter(['a'])).toArray()).toEqual(['a']);
  expect(lines(iter(['a', 'b'])).toArray()).toEqual(['ab']);
  expect(lines(iter(['a\nb'])).toArray()).toEqual(['a', 'b']);
  expect(lines(iter(['a\nb\r\nc'])).toArray()).toEqual(['a', 'b', 'c']);
  expect(lines(iter(['a\nb', 'c\n'])).toArray()).toEqual(['a', 'bc', '']);
  expect(lines(iter(['a\nb\r\nc\n\n'])).toArray()).toEqual([
    'a',
    'b',
    'c',
    '',
    '',
  ]);

  expect(lines(iter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toArray()).toEqual([
    '0123456789',
  ]);

  expect(lines(iter(['a\nb', 'c\r'])).toArray()).toEqual(['a', 'bc\r']);

  expect(
    lines(
      (function* gen() {
        yield 'a';
        yield 'b';
        yield Buffer.from('c\n');
        yield 'd';
        yield 'e';
      })()
    ).toArray()
  ).toEqual(['abc', 'de']);

  // check that the lines are the same as joining then splitting
  fc.assert(
    fc.property(
      fc
        .array(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constantFrom('\n', '\r\n')
          )
        )
        .filter((arr) => arr.length > 0),
      (arr) => {
        expect(lines(iter(arr)).toArray()).toEqual(arr.join('').split(/\r?\n/));
      }
    )
  );
});

test('lines (async)', async () => {
  expect(await lines(iter([]).async()).toArray()).toEqual([]);
  expect(await lines(iter(['']).async()).toArray()).toEqual(['']);
  expect(await lines(iter(['\n']).async()).toArray()).toEqual(['', '']);
  expect(await lines(iter(['a']).async()).toArray()).toEqual(['a']);
  expect(await lines(iter(['a', 'b']).async()).toArray()).toEqual(['ab']);
  expect(await lines(iter(['a\nb']).async()).toArray()).toEqual(['a', 'b']);
  expect(await lines(iter(['a\nb\r\nc']).async()).toArray()).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(await lines(iter(['a\nb', 'c\n']).async()).toArray()).toEqual([
    'a',
    'bc',
    '',
  ]);
  expect(await lines(iter(['a\nb\r\nc\n\n']).async()).toArray()).toEqual([
    'a',
    'b',
    'c',
    '',
    '',
  ]);

  expect(
    await lines(iter([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).async()).toArray()
  ).toEqual(['0123456789']);

  expect(await lines(iter(['a\nb', 'c\r']).async()).toArray()).toEqual([
    'a',
    'bc\r',
  ]);

  expect(
    await lines(
      (async function* gen() {
        yield 'a';
        yield 'b';
        yield Buffer.from('c\n');
        yield await Promise.resolve('d');
        yield 'e';
      })()
    ).toArray()
  ).toEqual(['abc', 'de']);

  const input = createReadStream(__filename);
  expect(await lines(input).toString('\n')).toEqual(
    await readFile(__filename, 'utf8')
  );

  // check that the lines are the same as joining then splitting
  await fc.assert(
    fc.asyncProperty(
      fc
        .array(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constantFrom('\n', '\r\n')
          )
        )
        .filter((arr) => arr.length > 0),
      async (arr) => {
        expect(await lines(iter(arr).async()).toArray()).toEqual(
          arr.join('').split(/\r?\n/)
        );
      }
    )
  );
});

test('stream interaction', async () => {
  const chunks: string[] = [];

  async function* indent(source: AsyncIterable<string>) {
    for await (const chunk of source) {
      yield `  ${chunk}`;
    }
  }

  async function* filterBlanks(source: AsyncIterable<string>) {
    for await (const chunk of source) {
      if (chunk !== '') {
        yield chunk;
      }
    }
  }

  await pipeline(
    iter(['a\nb\nc\n\n', 'd\ne\n\nf\n', 'g\nh\ni\n']).async(),

    // split into lines
    lines,

    // a filter
    filterBlanks,

    // a transform
    indent,

    // this is the sink
    async (source) => {
      for await (const chunk of source) {
        chunks.push(chunk);
      }
    }
  );

  expect(chunks).toEqual([
    '  a',
    '  b',
    '  c',
    '  d',
    '  e',
    '  f',
    '  g',
    '  h',
    '  i',
  ]);
});
