import { expect, test } from 'vitest';
import { integers, iter } from '@votingworks/basics';
import * as fc from 'fast-check';
import { jsonStream, JsonStreamInput, JsonStreamOptions } from './json_stream';

async function asString<T>(
  input: JsonStreamInput<T>,
  options?: JsonStreamOptions
) {
  return await iter(jsonStream<T>(input, options)).toString();
}

test('number', async () => {
  expect(await asString(1)).toEqual('1');
  expect(await asString(NaN)).toEqual('null');
  expect(await asString(0)).toEqual('0');
  expect(await asString(-0)).toEqual('0');
});

test('string', async () => {
  expect(await asString('hello')).toEqual('"hello"');
});

test('null', async () => {
  expect(await asString(null)).toEqual('null');
});

test('boolean', async () => {
  expect(await asString(true)).toEqual('true');
});

test('array', async () => {
  expect(await asString([])).toEqual('[]');
  expect(await asString([1, 2, 3])).toEqual('[1,2,3]');
  expect(await asString([1, 2, 3], { compact: false })).toEqual(
    '[\n  1,\n  2,\n  3\n]'
  );
});

test('object', async () => {
  expect(await asString({})).toEqual('{}');
  expect(await asString({ a: 1, b: 2 })).toEqual('{"a":1,"b":2}');
  expect(await asString({ a: 1, b: 2 }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": 2\n}'
  );
});

test('undefined object properties', async () => {
  expect(await asString({ a: 1, b: undefined })).toEqual('{"a":1}');
  expect(await asString({ a: undefined, b: 1 })).toEqual('{"b":1}');
  expect(await asString({ a: undefined, b: undefined })).toEqual('{}');
  expect(await asString({ a: 1, b: undefined }, { compact: false })).toEqual(
    '{\n  "a": 1\n}'
  );
});

test('nested', async () => {
  expect(await asString({ a: 1, b: [2, 3] })).toEqual('{"a":1,"b":[2,3]}');
  expect(await asString({ a: 1, b: [2, 3] }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}'
  );
});

test('nested object', async () => {
  expect(await asString({ a: 1, b: { c: 2 } })).toEqual('{"a":1,"b":{"c":2}}');
  expect(await asString({ a: 1, b: { c: 2 } }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}'
  );
});

test('iterable', async () => {
  expect(await asString(new Set([1, 2, 3]))).toEqual('[1,2,3]');
  expect(await asString(integers({ from: 1, through: 3 }))).toEqual('[1,2,3]');
  expect(
    await asString(integers({ from: 1, through: 3 }), { compact: false })
  ).toEqual('[\n  1,\n  2,\n  3\n]');
});

test('async iterable', async () => {
  expect(await asString(integers({ from: 1, through: 3 }).async())).toEqual(
    '[1,2,3]'
  );
});

test('allows iterables instead of arrays at any nesting level', async () => {
  interface Movie {
    title: string;
    actors: Actor[];
  }

  interface Actor {
    name: string;
    awards?: string[];
  }

  expect(
    JSON.parse(
      await asString<Movie[]>([
        {
          title: 'The Matrix',
          actors: (function* actors() {
            yield {
              name: 'Keanu Reeves',
              awards: ['MTV Movie & TV Award for Best Male Performance'],
            };
            yield {
              name: 'Laurence Fishburne',
              awards: iter(['MTV Movie & TV Award for Best Fight']),
            };
            yield {
              name: 'Carrie-Anne Moss',
              awards: (async function* awards() {
                yield await Promise.resolve('Empire Award for Best Newcomer');
              })(),
            };
          })(),
        },
      ])
    )
  ).toEqual<Movie[]>([
    {
      title: 'The Matrix',
      actors: [
        {
          name: 'Keanu Reeves',
          awards: ['MTV Movie & TV Award for Best Male Performance'],
        },
        {
          name: 'Laurence Fishburne',
          awards: ['MTV Movie & TV Award for Best Fight'],
        },
        {
          name: 'Carrie-Anne Moss',
          awards: ['Empire Award for Best Newcomer'],
        },
      ],
    },
  ]);
});

test('fails with circular references', async () => {
  const obj: { a: number; b?: unknown } = { a: 1 };
  obj.b = obj;
  await expect(asString(obj)).rejects.toThrowError();

  const arr: unknown[] = [];
  arr.push(arr);
  await expect(asString(arr)).rejects.toThrowError();

  const cleverCycle = {
    toJSON() {
      return this;
    },
  } as const;

  await expect(asString(cleverCycle)).rejects.toThrowError();
});

test('does not fail with multiple copies of the same object that are not cycles', async () => {
  const obj: { a: number; b?: unknown } = { a: 1 };
  const arr: unknown[] = [obj, obj];
  expect(await asString(arr)).toEqual('[{"a":1},{"a":1}]');
});

test('fails with non-serializable objects', async () => {
  await expect(asString({ a: 1, b: () => 2 })).rejects.toThrowError(
    `cannot serialize type 'function'`
  );
  await expect(asString([undefined])).rejects.toThrowError(
    `cannot serialize type 'undefined'`
  );
});

test('generates correct JSON', async () => {
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), fc.boolean(), async (input, compact) => {
      expect(
        JSON.parse(
          await asString(input as JsonStreamInput<unknown>, { compact })
        )
      ).toEqual(JSON.parse(JSON.stringify(input)));
    })
  );
});

test('delegates to toJSON', async () => {
  class Foo {
    toJSON() {
      return 1;
    }
  }
  expect(await asString(new Foo())).toEqual('1');
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), fc.boolean(), async (input, delegated) => {
      expect(
        JSON.parse(
          await asString(
            (delegated
              ? { toJSON: () => input }
              : input) as JsonStreamInput<unknown>
          )
        )
      ).toEqual(JSON.parse(JSON.stringify(input)));
    })
  );
});
