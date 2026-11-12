import { expect, test } from 'vitest';
import { makeIdFactory } from './id_factory.js';

test('makeIdFactory makes sequential ids until reset', () => {
  const idFactory = makeIdFactory();
  expect(idFactory.next()).toEqual('test-random-id-1');
  expect(idFactory.next()).toEqual('test-random-id-2');

  idFactory.reset();
  expect(idFactory.next()).toEqual('test-random-id-1');
});
