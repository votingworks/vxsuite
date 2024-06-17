import { typedAs } from '@votingworks/basics';
import { JSONSchema4 } from 'json-schema';
import {
  convertToGenericType,
  createEnumFromDefinition,
  createInterfaceFromDefinition,
  parseJsonSchema,
} from './json_schema';
import { Enum, Interface, Type } from './types';

test('parseJsonSchema', () => {
  expect(parseJsonSchema(`{`).unsafeUnwrapErr()).toBeInstanceOf(SyntaxError);
  parseJsonSchema(
    JSON.stringify(
      typedAs<JSONSchema4>({
        $schema: 'http://json-schema.org/draft-04/schema#',
      })
    )
  ).unsafeUnwrap();
});

test('createEnumFromDefinition', () => {
  expect(createEnumFromDefinition('foo', {})).toBeUndefined();
  expect(
    createEnumFromDefinition('foo', { type: 'string', enum: ['a', 'b'] })
  ).toEqual<Enum>({
    name: 'foo',
    values: [
      {
        name: 'A',
        value: 'a',
      },
      {
        name: 'B',
        value: 'b',
      },
    ],
  });
});

test('convertToGenericType', () => {
  expect(convertToGenericType({ type: 'string' })).toEqual<Type>({
    kind: 'string',
  });
  expect(
    convertToGenericType({ type: 'string', enum: ['a', 'b'] })
  ).toEqual<Type>({
    kind: 'union',
    types: [
      { kind: 'literal', value: 'a' },
      { kind: 'literal', value: 'b' },
    ],
  });
  expect(convertToGenericType({ type: 'boolean' })).toEqual<Type>({
    kind: 'boolean',
  });
  expect(convertToGenericType({ type: 'integer' })).toEqual<Type>({
    kind: 'integer',
  });
  expect(convertToGenericType({ type: 'number' })).toEqual<Type>({
    kind: 'number',
  });
  expect(
    convertToGenericType({ type: 'array', items: { type: 'string' } })
  ).toEqual<Type>({
    kind: 'array',
    items: { kind: 'string' },
  });
  expect(convertToGenericType({ $ref: '#/definitions/foo' })).toEqual({
    kind: 'reference',
    name: 'foo',
  });
  expect(convertToGenericType({ oneOf: [{ type: 'string' }] })).toEqual({
    kind: 'union',
    types: [{ kind: 'string' }],
  });
  // @ts-expect-error - validate that 'not a type' is not a valid type
  expect(() => convertToGenericType({ type: 'not a type' })).toThrow(
    'Unsupported schema type: not a type'
  );
});

test('createInterfaceFromDefinition', () => {
  expect(
    createInterfaceFromDefinition('Person', {
      type: 'object',
      additionalProperties: false,
    })
  ).toEqual<Interface>({
    name: 'Person',
    properties: [],
  });
  expect(
    createInterfaceFromDefinition('Person', {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    })
  ).toEqual<Interface>({
    name: 'Person',
    properties: [
      { name: 'name', type: { kind: 'string' }, required: true },
      { name: 'age', type: { kind: 'integer' }, required: false },
    ],
  });
});
