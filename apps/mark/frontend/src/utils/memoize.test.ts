import { expect, test, vi } from 'vitest';
import { memoize } from './memoize';

test('calls the underlying function as long as it returns undefined', () => {
  const fn = vi.fn();
  const mfn = memoize(fn);

  // `fn` hasn't been called yet
  expect(fn).toHaveBeenCalledTimes(0);

  // first value is discarded since it's undefined
  expect(mfn()).toBeUndefined();
  expect(fn).toHaveBeenCalledTimes(1);

  // second value is discarded since it's undefined
  expect(mfn()).toBeUndefined();
  expect(fn).toHaveBeenCalledTimes(2);

  // finally a value is cached
  fn.mockReturnValueOnce('cached!');
  expect(mfn()).toEqual('cached!');
});

test('stops calling the underlying function once it returns a value', () => {
  let i = 0;
  const fn = vi.fn().mockImplementation(() => {
    const result = i;
    i += 1;
    return result;
  });
  const mfn = memoize(fn);

  // `fn` hasn't been called yet
  expect(fn).toHaveBeenCalledTimes(0);
  expect(i).toEqual(0);

  // first value is computed and cached
  expect(mfn()).toEqual(0);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(i).toEqual(1);

  // first value is returned from cache
  expect(mfn()).toEqual(0);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(i).toEqual(1);
});
