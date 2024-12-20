/* eslint-disable no-console */
import { expect, test, vi } from 'vitest';
import { suppressingConsoleOutput } from './console';

test.each(['log', 'warn', 'error'] as const)(
  'suppressingConsoleOutput replaces console.%s with a mock',
  (method) => {
    const spy = vi.spyOn(console, method);
    suppressingConsoleOutput(() => {
      console[method]('test');
    });
    expect(spy).not.toHaveBeenCalled();
  }
);

test('suppressingConsoleOutput returns the value returned by the callback', () => {
  expect(suppressingConsoleOutput(() => 'test')).toEqual('test');
});

test('suppressingConsoleOutput resolves to the value returned by the callback', async () => {
  const originalLog = console.log;
  await expect(
    suppressingConsoleOutput(async () => await Promise.resolve('test'))
  ).resolves.toEqual('test');
  expect(console.log).toStrictEqual(originalLog);
});

test('suppressingConsoleOutput throws the error thrown by the callback', () => {
  const originalLog = console.log;
  expect(() =>
    suppressingConsoleOutput(() => {
      throw new Error('test');
    })
  ).toThrowError('test');
  expect(console.log).toStrictEqual(originalLog);
});

test('suppressingConsoleOutput rejects with the error thrown by the callback', async () => {
  const originalLog = console.log;
  await expect(
    suppressingConsoleOutput(() => Promise.reject(new Error('test')))
  ).rejects.toThrowError('test');
  expect(console.log).toStrictEqual(originalLog);
});
