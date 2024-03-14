/* eslint-disable no-console */
import { expect, test } from 'bun:test';
import { suppressingConsoleOutput } from './console';

test.each(['log', 'warn', 'error'] as const)(
  'suppressingConsoleOutput replaces console.%s with a mock',
  (method) => {
    suppressingConsoleOutput(() => {
      console[method]('test');
      expect(console[method]).toHaveBeenNthCalledWith(1, 'test');
    });
    expect('mock' in console[method]).toEqual(false);
  }
);

test('suppressingConsoleOutput returns the value returned by the callback', () => {
  expect(suppressingConsoleOutput(() => 'test')).toEqual('test');
  expect('mock' in console.log).toEqual(false);
});

test('suppressingConsoleOutput resolves to the value returned by the callback', async () => {
  expect(
    await suppressingConsoleOutput(async () => await Promise.resolve('test'))
  ).toEqual('test');
  expect('mock' in console.log).toEqual(false);
});

test('suppressingConsoleOutput throws the error thrown by the callback', () => {
  expect(() =>
    suppressingConsoleOutput(() => {
      throw new Error('test');
    })
  ).toThrow('test');
  expect('mock' in console.log).toEqual(false);
});

test('suppressingConsoleOutput rejects with the error thrown by the callback', async () => {
  expect(
    suppressingConsoleOutput(() => Promise.reject(new Error('test')))
  ).rejects.toThrow('test');
  expect('mock' in console.log).toEqual(false);
});
