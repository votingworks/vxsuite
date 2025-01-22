import { expect, test } from 'vitest';
import {
  isValidIdentifier,
  makeIdentifier,
  renderTypeAsDeclaration,
  renderTypeAsZodSchema,
} from './util';

test('makeIdentifier', () => {
  expect(makeIdentifier('foo')).toEqual('Foo');
  expect(makeIdentifier('foo-bar')).toEqual('FooBar');
  expect(makeIdentifier('abc-123')).toEqual('Abc123');
  expect(makeIdentifier('123-abc')).toEqual('_123Abc');
  expect(makeIdentifier('1.2.3')).toEqual('v1_2_3');
});

test('isValidIdentifier', () => {
  expect(isValidIdentifier('foo')).toEqual(true);
  expect(isValidIdentifier('a b')).toEqual(false);
  expect(isValidIdentifier('1ab')).toEqual(false);
});

test('renderTypeAsDeclaration', () => {
  expect(renderTypeAsDeclaration({ kind: 'string' })).toEqual('string');
  expect(renderTypeAsDeclaration({ kind: 'string', format: 'foo' })).toEqual(
    'Foo'
  );
  expect(renderTypeAsDeclaration({ kind: 'string', pattern: 'a+' })).toEqual(
    'string'
  );
  expect(renderTypeAsDeclaration({ kind: 'boolean' })).toEqual('boolean');
  expect(renderTypeAsDeclaration({ kind: 'integer' })).toEqual('integer');
  expect(renderTypeAsDeclaration({ kind: 'number' })).toEqual('number');
  expect(renderTypeAsDeclaration({ kind: 'literal', value: 1 })).toEqual('1');
  expect(renderTypeAsDeclaration({ kind: 'literal', value: 'abc' })).toEqual(
    "'abc'"
  );
  expect(
    renderTypeAsDeclaration({ kind: 'array', items: { kind: 'string' } })
  ).toEqual('readonly string[]');
  expect(
    renderTypeAsDeclaration({
      kind: 'array',
      items: { kind: 'union', types: [{ kind: 'string' }, { kind: 'number' }] },
    })
  ).toEqual('ReadonlyArray<string | number>');
  expect(renderTypeAsDeclaration({ kind: 'reference', name: 'foo' })).toEqual(
    'foo'
  );

  // @ts-expect-error - checks for illegal values
  expect(() => renderTypeAsDeclaration({ kind: 'invalid' })).toThrow();
});

test('renderTypeAsZodSchema', () => {
  expect(renderTypeAsZodSchema({ kind: 'string' })).toEqual('z.string()');
  expect(renderTypeAsZodSchema({ kind: 'string', format: 'foo' })).toEqual(
    'FooSchema'
  );
  expect(renderTypeAsZodSchema({ kind: 'boolean' })).toEqual('z.boolean()');
  expect(renderTypeAsZodSchema({ kind: 'number' })).toEqual('z.number()');
  expect(renderTypeAsZodSchema({ kind: 'integer' })).toEqual('integerSchema');
  expect(renderTypeAsZodSchema({ kind: 'literal', value: 'abc' })).toEqual(
    `z.literal('abc')`
  );
  expect(renderTypeAsZodSchema({ kind: 'literal', value: 1 })).toEqual(
    'z.literal(1)'
  );
  expect(
    renderTypeAsZodSchema({ kind: 'array', items: { kind: 'string' } })
  ).toEqual('z.array(z.string())');
  expect(
    renderTypeAsZodSchema({
      kind: 'array',
      items: { kind: 'string' },
      minItems: 1,
    })
  ).toEqual('z.array(z.string()).min(1)');
  expect(renderTypeAsZodSchema({ kind: 'reference', name: 'Foo' })).toEqual(
    'z.lazy(/* istanbul ignore next - @preserve */ () => FooSchema)'
  );
  expect(
    renderTypeAsZodSchema({
      kind: 'union',
      types: [{ kind: 'string' }],
    })
  ).toEqual('z.string()');
  expect(
    renderTypeAsZodSchema({
      kind: 'union',
      types: [{ kind: 'string' }, { kind: 'boolean' }],
    })
  ).toEqual('z.union([z.string(), z.boolean()])');

  // @ts-expect-error - checks for illegal values
  expect(() => renderTypeAsZodSchema({ kind: 'invalid' })).toThrow();
});
