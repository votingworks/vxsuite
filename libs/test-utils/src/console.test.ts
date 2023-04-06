/* eslint-disable no-console */
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
  await expect(
    suppressingConsoleOutput(async () => await Promise.resolve('test'))
  ).resolves.toEqual('test');
  expect('mock' in console.log).toEqual(false);
});

test('suppressingConsoleOutput throws the error thrown by the callback', () => {
  expect(() =>
    suppressingConsoleOutput(() => {
      throw new Error('test');
    })
  ).toThrowError('test');
  expect('mock' in console.log).toEqual(false);
});

test('suppressingConsoleOutput rejects with the error thrown by the callback', async () => {
  await expect(
    suppressingConsoleOutput(() => Promise.reject(new Error('test')))
  ).rejects.toThrowError('test');
  expect('mock' in console.log).toEqual(false);
});
