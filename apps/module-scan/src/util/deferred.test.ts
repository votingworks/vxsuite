import deferred, { queue } from './deferred'

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

test('queues can resolve values before getting them', async () => {
  const q = queue<number>()

  q.resolve(12)
  await expect(q.get()).resolves.toEqual(12)
})

test('queues can get before resolving', async () => {
  const q = queue<number>()
  const getPromise = q.get()

  q.resolve(12)
  await expect(getPromise).resolves.toEqual(12)
})

test('queues can resolve multiple items to be gotten', async () => {
  const q = queue<number>()

  q.resolve(1)
  q.resolve(2)
  q.resolve(3)
  await expect(q.get()).resolves.toEqual(1)
  await expect(q.get()).resolves.toEqual(2)
  await expect(q.get()).resolves.toEqual(3)
})

test('queues can get multiple items that are later resolved', async () => {
  const q = queue<number>()

  const v1 = q.get()
  const v2 = q.get()
  const v3 = q.get()

  q.resolve(1)
  q.resolve(2)
  q.resolve(3)

  await expect(v1).resolves.toEqual(1)
  await expect(v2).resolves.toEqual(2)
  await expect(v3).resolves.toEqual(3)
})

test('queues can interleave gets and resolves', async () => {
  const q = queue<number>()

  q.resolve(1)
  const v1 = q.get()
  q.resolve(2)
  const v2 = q.get()
  const v3 = q.get()
  q.resolve(3)

  await expect(v1).resolves.toEqual(1)
  await expect(v2).resolves.toEqual(2)
  await expect(v3).resolves.toEqual(3)
})

test('queues can reject then get', async () => {
  const q = queue<number>()

  q.reject(new Error('no way!'))
  await expect(q.get()).rejects.toThrowError('no way!')
})

test('queues can get then reject', async () => {
  const q = queue<number>()
  const getPromise = q.get()

  q.reject(new Error('no way!'))
  await expect(getPromise).rejects.toThrowError('no way!')
})

test('queues can resolve all future gets', async () => {
  const q = queue<number>()

  q.resolve(1)
  q.resolve(2)
  q.resolveAll(3)

  await expect(q.get()).resolves.toEqual(1)
  await expect(q.get()).resolves.toEqual(2)
  await expect(q.get()).resolves.toEqual(3)
  await expect(q.get()).resolves.toEqual(3)
  await expect(q.get()).resolves.toEqual(3)
})

test('queues can resolve all past gets', async () => {
  const q = queue<number>()

  const gets = [q.get(), q.get()]
  q.resolveAll(3)
  await expect(Promise.all(gets)).resolves.toEqual([3, 3])
})

test('queues can reject all future gets', async () => {
  const q = queue<number>()

  q.resolve(1)
  q.resolve(2)
  q.rejectAll(new Error('no more for you'))

  await expect(q.get()).resolves.toEqual(1)
  await expect(q.get()).resolves.toEqual(2)
  await expect(q.get()).rejects.toThrowError('no more for you')
  await expect(q.get()).rejects.toThrowError('no more for you')
  await expect(q.get()).rejects.toThrowError('no more for you')
})

test('queues can reject all past gets', async () => {
  const q = queue<number>()

  const gets = [q.get(), q.get()]
  q.rejectAll(NaN)
  await expect(Promise.allSettled(gets)).resolves.toEqual([
    { status: 'rejected', reason: NaN },
    { status: 'rejected', reason: NaN },
  ])
})

test('queues disallow mutation after resolveAll', async () => {
  const q = queue<number>()

  q.resolveAll(1)

  expect(() => q.resolve(2)).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.reject()).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.resolveAll(3)).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.rejectAll()).toThrowError(
    'resolveAll or rejectAll already called'
  )
})

test('queues disallow mutation after rejectAll', async () => {
  const q = queue<number>()

  q.rejectAll()

  expect(() => q.resolve(2)).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.reject()).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.resolveAll(3)).toThrowError(
    'resolveAll or rejectAll already called'
  )
  expect(() => q.rejectAll()).toThrowError(
    'resolveAll or rejectAll already called'
  )
})
