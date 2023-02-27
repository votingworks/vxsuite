import { integers } from '@votingworks/basics';
import * as fc from 'fast-check';
import { jsonStream } from './json_stream';

function asString(input: unknown) {
  const output = [];
  for (const chunk of jsonStream(input)) {
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
  expect(asString([1, 2, 3])).toEqual('[\n  1,\n  2,\n  3\n]');
});

test('object', () => {
  expect(asString({})).toEqual('{}');
  expect(asString({ a: 1, b: 2 })).toEqual('{\n  "a": 1,\n  "b": 2\n}');
});

test('undefined object properties', () => {
  expect(asString({ a: 1, b: undefined })).toEqual('{\n  "a": 1\n}');
  expect(asString({ a: undefined, b: 1 })).toEqual('{\n  "b": 1\n}');
});

test('nested', () => {
  expect(asString({ a: 1, b: [2, 3] })).toEqual(
    '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}'
  );
});

test('nested object', () => {
  expect(asString({ a: 1, b: { c: 2 } })).toEqual(
    '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}'
  );
});

test('iterable', () => {
  expect(asString(new Set([1, 2, 3]))).toEqual('[\n  1,\n  2,\n  3\n]');
  expect(asString(integers({ from: 1, through: 3 }))).toEqual(
    '[\n  1,\n  2,\n  3\n]'
  );
});

test('generates correct JSON', () => {
  const serializable = fc.letrec((tie) => ({
    any: fc.oneof(
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.array(tie('any')),
      fc.record({ key: fc.string(), value: tie('any') })
    ),
  })).any;

  fc.assert(
    fc.property(serializable, (input) => {
      expect(JSON.parse(asString(input))).toEqual(input);
    })
  );
});
