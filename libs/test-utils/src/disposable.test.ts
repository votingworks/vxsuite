/* eslint-disable no-lone-blocks */
import { expect, test } from 'vitest';
import { asyncDisposable, disposable } from './disposable';

test('disposable', () => {
  let disposed = false;

  {
    using resource = disposable({}, () => {
      disposed = true;
    });

    expect(Symbol.dispose in resource).toEqual(true);
    expect(Symbol.asyncDispose in resource).toEqual(false);
    expect(resource[Symbol.dispose]).toBeInstanceOf(Function);
    expect(
      (resource as { [Symbol.asyncDispose]?: unknown })[Symbol.asyncDispose]
    ).toBeUndefined();
    expect(disposed).toEqual(false);
  }

  expect(disposed).toEqual(true);
});

test('disposable runs even if an exception is thrown', () => {
  let disposed = false;

  try {
    using resource = disposable({}, () => {
      disposed = true;
    });

    throw new Error(resource.toString());
  } catch (e) {
    // ignore
  }

  expect(disposed).toEqual(true);
});

test('asyncDisposable', async () => {
  let disposed = false;

  {
    await using resource = asyncDisposable(
      await Promise.resolve({}),
      async () => {
        disposed = await Promise.resolve(true);
      }
    );

    expect(Symbol.asyncDispose in resource).toEqual(true);
    expect(resource[Symbol.asyncDispose]).toBeInstanceOf(Function);
    expect(Symbol.dispose in resource).toEqual(false);
    expect(
      (resource as { [Symbol.dispose]?: unknown })[Symbol.dispose]
    ).toBeUndefined();
    expect(disposed).toEqual(false);
  }

  expect(disposed).toEqual(true);
});

test('asyncDisposable runs even if an exception is thrown', async () => {
  let disposed = false;

  try {
    await using resource = asyncDisposable(
      await Promise.resolve({}),
      async () => {
        disposed = await Promise.resolve(true);
      }
    );

    throw new Error(resource.toString());
  } catch (e) {
    // ignore
  }

  expect(disposed).toEqual(true);
});
