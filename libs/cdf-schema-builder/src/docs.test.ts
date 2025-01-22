import { expect, test } from 'vitest';
import { findDocForProperty, findDocForType } from './docs';
import { DocumentedEntity } from './types';

test('findDocForType', () => {
  const docs: DocumentedEntity[] = [
    {
      kind: 'DocumentedType',
      type: 'test',
      documentation: 'test',
    },
  ];
  expect(findDocForType(docs, 'test')).toEqual(docs[0]);
  expect(findDocForType(docs, 'missing')).toBeUndefined();
});

test('findDocForProperty', () => {
  const docs: DocumentedEntity[] = [
    {
      kind: 'DocumentedType',
      type: 'test',
      documentation: 'test',
    },
    {
      kind: 'DocumentedProperty',
      type: 'test',
      name: 'prop',
      documentation: 'test',
    },
    {
      kind: 'DocumentedType',
      type: 'subtype',
      extends: 'test',
    },
  ];
  expect(findDocForProperty(docs, 'test', 'prop')).toEqual(docs[1]);
  expect(findDocForProperty(docs, 'subtype', 'prop')).toEqual(docs[1]);
});
