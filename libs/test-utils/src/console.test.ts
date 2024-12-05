/* eslint-disable no-console */
import { expect, test } from 'vitest';
import { suppressingConsoleOutput } from './console';

test.each(['log', 'warn', 'error'] as const)(
  'suppressingConsoleOutput replaces console.%s with a mock',
  async (method) => {
    const original = console[method];
    await suppressingConsoleOutput(() => {
      console[method]('test');
      expect(console[method]).toHaveBeenNthCalledWith(1, 'test');
    });
    expect(console[method]).toStrictEqual(original);
  }
);

test('suppressingConsoleOutput returns the value returned by the callback', async () => {
  expect(await suppressingConsoleOutput(() => 'test')).toEqual('test');
});

test('suppressingConsoleOutput resolves to the value returned by the callback', async () => {
  await expect(
    suppressingConsoleOutput(async () => await Promise.resolve('test'))
  ).resolves.toEqual('test');
});

test('suppressingConsoleOutput rejects with the error thrown by the callback', async () => {
  await expect(
    suppressingConsoleOutput(() => Promise.reject(new Error('test')))
  ).rejects.toThrowError('test');
});
