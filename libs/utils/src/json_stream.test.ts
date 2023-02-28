import { integers } from '@votingworks/basics';
import * as fc from 'fast-check';
import { jsonStream, JsonStreamInput } from './json_stream';

function asString<T>(
  input: JsonStreamInput<T>,
  options?: Parameters<typeof jsonStream>[1]
) {
  const output = [];
  for (const chunk of jsonStream<T>(input, options)) {
    output.push(chunk);
  }
  return output.join('');
}

test('number', () => {
  expect(asString(1)).toEqual('1');
});

test('string', () => {
  expect(asString('hello')).toEqual('"hello"');
});

test('null', () => {
  expect(asString(null)).toEqual('null');
});

test('boolean', () => {
  expect(asString(true)).toEqual('true');
});

test('array', () => {
  expect(asString([])).toEqual('[]');
  expect(asString([1, 2, 3])).toEqual('[1,2,3]');
  expect(asString([1, 2, 3], { compact: false })).toEqual(
    '[\n  1,\n  2,\n  3\n]'
  );
});

test('object', () => {
  expect(asString({})).toEqual('{}');
  expect(asString({ a: 1, b: 2 })).toEqual('{"a":1,"b":2}');
  expect(asString({ a: 1, b: 2 }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": 2\n}'
  );
});

test('undefined object properties', () => {
  expect(asString({ a: 1, b: undefined })).toEqual('{"a":1}');
  expect(asString({ a: undefined, b: 1 })).toEqual('{"b":1}');
  expect(asString({ a: undefined, b: undefined })).toEqual('{}');
  expect(asString({ a: 1, b: undefined }, { compact: false })).toEqual(
    '{\n  "a": 1\n}'
  );
});

test('nested', () => {
  expect(asString({ a: 1, b: [2, 3] })).toEqual('{"a":1,"b":[2,3]}');
  expect(asString({ a: 1, b: [2, 3] }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}'
  );
});

test('nested object', () => {
  expect(asString({ a: 1, b: { c: 2 } })).toEqual('{"a":1,"b":{"c":2}}');
  expect(asString({ a: 1, b: { c: 2 } }, { compact: false })).toEqual(
    '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}'
  );
});

test('iterable', () => {
  expect(asString(new Set([1, 2, 3]))).toEqual('[1,2,3]');
  expect(asString(integers({ from: 1, through: 3 }))).toEqual('[1,2,3]');
  expect(
    asString(integers({ from: 1, through: 3 }), { compact: false })
  ).toEqual('[\n  1,\n  2,\n  3\n]');
});

test('generates correct JSON', () => {
  fc.assert(
    fc.property(fc.jsonObject(), fc.boolean(), (input, compact) => {
      expect(
        JSON.parse(asString(input as JsonStreamInput<unknown>, { compact }))
      ).toEqual(input);
    })
  );
});
