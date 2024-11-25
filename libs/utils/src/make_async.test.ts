import { makeAsync } from './make_async';

test('makes function async', async () => {
  const concatenate = jest.fn((num: number, str: string) => `${num} ${str}`);
  expect(concatenate(1, 'thing')).toEqual('1 thing');
  expect(concatenate).toHaveBeenCalledTimes(1);

  const asyncConcatenate = makeAsync(concatenate);
  expect(concatenate).toHaveBeenCalledTimes(1);

  const resultPromise = asyncConcatenate(1, 'thing');
  expect(concatenate).toHaveBeenCalledTimes(2);

  const result = await resultPromise;
  expect(result).toEqual('1 thing');

  // compile-time check for return value typing
  expect(result.startsWith('1')).toEqual(true);
});
