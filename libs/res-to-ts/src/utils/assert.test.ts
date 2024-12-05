import { assert } from './assert.js';

test('assert', () => {
  expect(() => assert(true, 'true')).not.toThrow();
  expect(() => assert(false, 'false')).toThrow('false');
  expect(() => assert(false)).toThrow('Assertion failed');
});
