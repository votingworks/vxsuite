import deferred from './deferred'

test('resolves with value passed to resolve', async () => {
  const { promise, resolve } = deferred<number>()

  resolve(12)
  await expect(promise).resolves.toEqual(12)
})

test('rejects with value passed to reject', async () => {
  const { promise, reject } = deferred<number>()

  reject(new Error('NOPE'))
  await expect(promise).rejects.toThrowError('NOPE')
})
