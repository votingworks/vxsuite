import memoize from './memoize'

it('calls the underlying function as long as it returns undefined', () => {
  const fn = jest.fn()
  const mfn = memoize(fn)

  // `fn` hasn't been called yet
  expect(fn).toHaveBeenCalledTimes(0)

  // first value is discarded since it's undefined
  expect(mfn()).toBeUndefined()
  expect(fn).toHaveBeenCalledTimes(1)

  // second value is discarded since it's undefined
  expect(mfn()).toBeUndefined()
  expect(fn).toHaveBeenCalledTimes(2)

  // finally a value is cached
  fn.mockReturnValueOnce('cached!')
  expect(mfn()).toBe('cached!')
})

it('stops calling the underlying function once it returns a value', () => {
  let i = 0
  const fn = jest.fn().mockImplementation(() => i++)
  const mfn = memoize(fn)

  // `fn` hasn't been called yet
  expect(fn).toHaveBeenCalledTimes(0)
  expect(i).toBe(0)

  // first value is computed and cached
  expect(mfn()).toBe(0)
  expect(fn).toHaveBeenCalledTimes(1)
  expect(i).toBe(1)

  // first value is returned from cache
  expect(mfn()).toBe(0)
  expect(fn).toHaveBeenCalledTimes(1)
  expect(i).toBe(1)
})
