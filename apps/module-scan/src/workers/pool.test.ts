import { EventEmitter } from 'events'
import { join } from 'path'
import { makeMockWorkerOps } from '../../test/util/mocks'
import { childProcessPool, WorkerPool, workerThreadPool } from './pool'

test('starts new workers when starting the pool', () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  pool.start()
  expect(ops.start).toHaveBeenCalledTimes(3)
})

test('stops returned workers when stopping the pool', () => {
  const ops = makeMockWorkerOps<number>()
  const w1 = new EventEmitter()
  const w2 = new EventEmitter()
  const w3 = new EventEmitter()
  ops.start
    .mockReturnValueOnce(w1)
    .mockReturnValueOnce(w2)
    .mockReturnValueOnce(w3)
  const pool = new WorkerPool(ops, 3)
  pool.start()
  pool.stop()
  expect(ops.stop).toHaveBeenNthCalledWith(1, w1)
  expect(ops.stop).toHaveBeenNthCalledWith(2, w2)
  expect(ops.stop).toHaveBeenNthCalledWith(3, w3)
  expect(ops.stop).toHaveBeenCalledTimes(3)
})

test('cannot call a worker without starting first', async () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  await expect(() => pool.call(1)).rejects.toThrowError('not yet started')
})

test('cannot callAll without starting first', async () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  await expect(() => pool.callAll(1)).rejects.toThrowError('not yet started')
})

test('cannot claim specific worker without starting first', async () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  const worker = new EventEmitter()
  await expect(() => pool['claimWorker'](worker, 'test')).rejects.toThrowError(
    'not yet started'
  )
})

test('cannot claim an unowned worker', async () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 1)
  const worker = new EventEmitter()
  const anotherWorker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)
  pool.start()
  await expect(() =>
    pool['claimWorker'](anotherWorker, 'test')
  ).rejects.toThrowError('worker is not owned by this instance')
})

test('cannot start workers again after starting once', () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  pool.start()
  expect(() => pool.start()).toThrowError('already started')
})

test('calling stop again does nothing', () => {
  const ops = makeMockWorkerOps<number>()
  const pool = new WorkerPool(ops, 3)
  pool.start()
  pool.stop()
  expect(() => pool.stop()).not.toThrowError()
})

test('call sends a message to a worker', async () => {
  const ops = makeMockWorkerOps<number>()
  const worker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)

  const pool = new WorkerPool(ops, 1)
  pool.start()

  const callPromise = pool.call(4)

  // wait for worker to be claimed
  await Promise.resolve()

  // respond to the call
  worker.emit('message', { output: 16 })

  expect(await callPromise).toEqual(16)
  expect(ops.send).toHaveBeenCalledWith(worker, 4, undefined)
})

test('call gets the next available worker and sends a message to it', async () => {
  const ops = makeMockWorkerOps<number>()
  const worker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)

  const pool = new WorkerPool(ops, 1)
  pool.start()

  const call1Promise = pool.call(4)
  const call2Promise = pool.call(5)

  // wait for worker to be claimed for call 1
  await Promise.resolve()

  // respond to call 1
  worker.emit('message', { output: 16 })

  expect(await call1Promise).toEqual(16)

  // respond to call 2
  worker.emit('message', { output: 25 })

  expect(await call2Promise).toEqual(25)

  expect(ops.send).toHaveBeenNthCalledWith(1, worker, 4, undefined)
  expect(ops.send).toHaveBeenNthCalledWith(2, worker, 5, undefined)
})

test('callAll sends a message to all workers', async () => {
  const ops = makeMockWorkerOps<number>()
  const w1 = new EventEmitter()
  const w2 = new EventEmitter()
  ops.start.mockReturnValueOnce(w1).mockReturnValueOnce(w2)

  const pool = new WorkerPool<number, number>(ops, 2)
  pool.start()

  const callAllPromise = pool.callAll(99)

  // wait for worker 1 to be claimed
  await Promise.resolve()

  // respond to callAll
  w1.emit('message', { output: 1 })

  // wait for worker 2 to be claimed
  await Promise.resolve()

  // respond to callAll
  w2.emit('message', { output: 2 })

  expect(await callAllPromise).toEqual([1, 2])
})

test('callAll sends a message to all workers, even if they are busy at first', async () => {
  const ops = makeMockWorkerOps<number>()
  const w1 = new EventEmitter()
  const w2 = new EventEmitter()
  ops.start.mockReturnValueOnce(w1).mockReturnValueOnce(w2)

  const pool = new WorkerPool<number, number>(ops, 2)
  pool.start()

  const call1Promise = pool.call(1)
  const call2Promise = pool.call(2)
  const callAllPromise = pool.callAll(99)

  // wait for worker 1 to be claimed for call 1
  await Promise.resolve()

  // respond to call 1
  w1.emit('message', { output: -1 })
  expect(await call1Promise).toEqual(-1)

  // respond to call 2
  w2.emit('message', { output: -2 })
  expect(await call2Promise).toEqual(-2)

  // respond to callAll
  w1.emit('message', { output: -99 })

  // wait for worker 2 to be claimed for callAll
  await Promise.resolve()

  // respond to callAll
  w2.emit('message', { output: -98 })

  expect(await callAllPromise).toEqual([-99, -98])
})

test('releasing a worker before starting is not allowed', async () => {
  const ops = makeMockWorkerOps<number>()
  const worker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)

  const pool = new WorkerPool<number, number>(ops, 1)
  await expect(pool['releaseWorker'](worker, 'test')).rejects.toThrowError(
    'not yet started'
  )
})

test('releasing a non-claimed worker is not allowed', async () => {
  const ops = makeMockWorkerOps<number>()
  const worker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)

  const pool = new WorkerPool<number, number>(ops, 1)
  pool.start()
  await expect(pool['releaseWorker'](worker, 'test')).rejects.toThrowError(
    'worker is not currently claimed'
  )
})

test('releasing a non-owned worker is not allowed', async () => {
  const ops = makeMockWorkerOps<number>()
  const worker = new EventEmitter()
  const anotherWorker = new EventEmitter()
  ops.start.mockReturnValueOnce(worker)

  const pool = new WorkerPool<number, number>(ops, 1)
  pool.start()
  await expect(
    pool['releaseWorker'](anotherWorker, 'test')
  ).rejects.toThrowError('worker is not owned by this instance')
})

test('child process workers work', async () => {
  const pool = childProcessPool<string, string>(join(__dirname, 'echo.ts'), 1)
  pool.start()
  try {
    expect(await pool.call('hello child process')).toEqual(
      'hello child process'
    )
  } finally {
    pool.stop()
  }
})

test('child process workers can send objects', async () => {
  const pool = childProcessPool<
    Record<string, unknown>,
    Record<string, unknown>
  >(join(__dirname, 'echo.ts'), 1)
  pool.start()
  try {
    expect(await pool.call({ a: 1, b: { c: 2 } })).toEqual({
      a: 1,
      b: { c: 2 },
    })
  } finally {
    pool.stop()
  }
})

test('child process workers can send arrays', async () => {
  const pool = childProcessPool<unknown[], unknown[]>(
    join(__dirname, 'echo.ts'),
    1
  )
  pool.start()
  try {
    expect(await pool.call([1, '2', null, undefined])).toEqual([
      1,
      '2',
      null,
      undefined,
    ])
  } finally {
    pool.stop()
  }
})

test('child process workers can send Buffers', async () => {
  const pool = childProcessPool<Buffer, Buffer>(join(__dirname, 'echo.ts'), 1)
  pool.start()
  try {
    expect(await pool.call(Buffer.of(1, 2, 3))).toEqual(Buffer.of(1, 2, 3))
  } finally {
    pool.stop()
  }
})

test('child process workers can send Uint8Arrays', async () => {
  const pool = childProcessPool<Uint8Array, Uint8Array>(
    join(__dirname, 'echo.ts'),
    1
  )
  pool.start()
  try {
    expect(await pool.call(Uint8Array.of(1, 2, 3))).toEqual(
      Uint8Array.of(1, 2, 3)
    )
  } finally {
    pool.stop()
  }
})

test('child process workers cannot send functions', async () => {
  const pool = childProcessPool<unknown, unknown>(join(__dirname, 'echo.ts'), 1)
  pool.start()
  try {
    await expect(
      pool.call({
        a: {
          fn(): void {
            // noop
          },
        },
      })
    ).rejects.toThrow(`cannot serialize function in message at key path 'a.fn'`)
  } finally {
    pool.stop()
  }
})

test('worker thread workers work', async () => {
  const pool = workerThreadPool<string, string>(join(__dirname, 'echo.ts'), 1)
  pool.start()
  try {
    expect(await pool.call('hello worker thread')).toEqual(
      'hello worker thread'
    )
  } finally {
    pool.stop()
  }
})
