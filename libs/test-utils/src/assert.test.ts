import { assert } from './assert';

test('assert throws error if condition is false', () => {
  expect(() => {
    assert(false, 'message');
  }).toThrowError('message');
});

test('assert does not throw error if condition is true', () => {
  expect(() => {
    assert(true, 'message');
  }).not.toThrowError();
});
