import { strict as assert } from 'assert'
import { ChildProcess, fork } from 'child_process'
import makeDebug from 'debug'
import { EventEmitter } from 'events'
import { cpus } from 'os'
import { join } from 'path'
import { inspect } from 'util'
import { v4 as uuid } from 'uuid'
import { MessagePort, Worker } from 'worker_threads'
import deferred, { Deferred } from '../util/deferred'
import * as json from './json-serialization'

const debug = makeDebug('module-scan:pool')

export interface WorkerOps<I, W extends EventEmitter = EventEmitter> {
  start(): W
  stop(worker: W): void
  send(
    worker: W,
    message: I,
    transferList?: (ArrayBuffer | MessagePort)[]
  ): void
  describe(worker: W): string
}

export class ChildProcessWorkerOps<I> implements WorkerOps<I, ChildProcess> {
  public constructor(private readonly main: string) {}

  public start(): ChildProcess {
    return fork(join(__dirname, 'child-process-worker.js'), [this.main])
  }

  public stop(worker: ChildProcess): void {
    worker.kill()
  }

  public send(worker: ChildProcess, message: I): void {
    worker.send(json.serialize(message))
  }

  public describe(worker: ChildProcess): string {
    return `ChildProcess { pid: ${worker.pid} }`
  }
}

export class WorkerThreadWorkerOps<I> implements WorkerOps<I, Worker> {
  public constructor(private readonly main: string) {}

  public start(): Worker {
    return new Worker(join(__dirname, 'worker-thread-worker.js'), {
      workerData: { __workerPath: this.main },
    })
  }

  public stop(worker: Worker): void {
    worker.terminate()
  }

  public send(
    worker: Worker,
    message: I,
    transferList?: (ArrayBuffer | MessagePort)[]
  ): void {
    worker.postMessage(json.serialize(message), transferList)
  }

  public describe(worker: Worker): string {
    return `Worker { threadId: ${worker.threadId} }`
  }
}

export class InlineWorkerOps<I, O> implements WorkerOps<I, EventEmitter> {
  private workerInstance: EventEmitter

  public constructor(private readonly call: (input: I) => Promise<O>) {
    this.workerInstance = new EventEmitter()
  }

  public start(): EventEmitter {
    return this.workerInstance
  }

  public stop(worker: EventEmitter): void {
    assert.strictEqual(worker, this.workerInstance)
    worker.removeAllListeners()
  }

  public async send(worker: EventEmitter, message: I): Promise<void> {
    assert.strictEqual(worker, this.workerInstance)
    try {
      const output = await this.call(
        json.deserialize(json.serialize(message)) as I
      )
      worker.emit('message', { output: json.serialize(output) })
    } catch (error) {
      worker.emit('error', error)
    }
  }

  public describe(): string {
    return 'Worker { inline: true }'
  }
}

export class WorkerPool<I, O, W extends EventEmitter = EventEmitter> {
  private workers?: Set<W>
  private claimedWorkers?: Set<W>
  private outstandingClaims: Deferred<W>[] = []
  private outstandingPerWorkerClaims = new Map<W, Deferred<W>[]>()

  constructor(
    private readonly workerOps: WorkerOps<I, W>,
    private readonly size: number
  ) {}

  public start(): void {
    if (this.workers) {
      throw new Error('cannot start when already started')
    }

    const workers = new Set<W>()

    for (let i = 0; i < this.size; i++) {
      const worker = this.workerOps.start()
      debug('started worker #%d: %o', i, this.workerOps.describe(worker))
      workers.add(worker)
    }

    this.workers = workers
    this.claimedWorkers = new Set()
    debug('started %d worker(s)', this.workers.size)
  }

  public stop(): void {
    const { workers } = this

    if (!workers) {
      return
    }

    delete this.workers

    debug('stopping %d worker(s)', workers.size)
    for (const worker of workers) {
      debug('stopping worker: %o', this.workerOps.describe(worker))
      this.workerOps.stop(worker)
    }
  }

  private async claimWorker(worker: W, traceId: string): Promise<W> {
    debug('[%s] claiming worker: %o', traceId, this.workerOps.describe(worker))
    const { workers, claimedWorkers, outstandingPerWorkerClaims } = this

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started')
    }

    if (!workers.has(worker)) {
      throw new Error('worker is not owned by this instance')
    }

    if (!claimedWorkers.has(worker)) {
      debug('[%s] worker is available, claiming', traceId)
      claimedWorkers.add(worker)
      return worker
    }

    debug('[%s] worker is not available now, waiting…', traceId)
    const workerClaims = outstandingPerWorkerClaims.get(worker) ?? []
    const workerDeferred = deferred<W>()
    workerClaims.push(workerDeferred)
    outstandingPerWorkerClaims.set(worker, workerClaims)
    const awaitedWorker = await workerDeferred.promise
    debug('[%s] got newly-free worker', traceId)
    return awaitedWorker
  }

  private async claimFreeWorker(traceId: string): Promise<W> {
    debug('[%s] claiming free worker', traceId)
    const { workers, claimedWorkers } = this

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started')
    }

    let i = 0
    for (const worker of workers) {
      if (!claimedWorkers.has(worker)) {
        debug('[%s] worker #%d is available, claiming', traceId, i)
        claimedWorkers.add(worker)
        return worker
      }

      i++
    }

    debug('[%s] no workers are available now, waiting…', traceId)
    const workerDeferred = deferred<W>()
    this.outstandingClaims.push(workerDeferred)
    const worker = await workerDeferred.promise
    debug('[%s] got newly-free worker', traceId)
    return worker
  }

  private async releaseWorker(worker: W, traceId: string): Promise<void> {
    const { workers, claimedWorkers } = this

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started')
    }

    if (!workers.has(worker)) {
      throw new Error('worker is not owned by this instance')
    }

    if (!claimedWorkers.has(worker)) {
      throw new Error('worker is not currently claimed')
    }

    let i = 0
    for (const w of workers) {
      if (w === worker) {
        debug(
          '[%s] releasing worker #%d: %o',
          traceId,
          i,
          this.workerOps.describe(worker)
        )
        for (const [cw, workerDeferreds] of this.outstandingPerWorkerClaims) {
          if (cw === worker) {
            const workerDeferred = workerDeferreds.shift()

            if (workerDeferred) {
              debug(
                '[%s] there is an outstanding claim for this worker specifically, passing directly rather than releasing',
                traceId
              )

              workerDeferred.resolve(worker)
              return
            }
          }
        }

        const workerDeferred = this.outstandingClaims.shift()

        if (workerDeferred) {
          debug(
            '[%s] there is a general outstanding claim, passing worker directly rather than releasing',
            traceId
          )
          workerDeferred.resolve(worker)
          return
        }

        break
      }

      i++
    }

    debug('[%s] worker #%d released', traceId, i)
    claimedWorkers.delete(worker)
  }

  public async call(
    input: I,
    transferList?: (ArrayBuffer | MessagePort)[]
  ): Promise<O> {
    const traceId = uuid()
    debug(
      '[%s] call start: input=%s',
      traceId,
      inspect(input, undefined, undefined, true)
    )
    const worker = await this.claimFreeWorker(traceId)
    debug('[%s] worker claimed: %o', traceId, this.workerOps.describe(worker))
    return await this.callWorker(worker, input, traceId, transferList)
  }

  public async callAll(input: I): Promise<O[]> {
    const { workers, claimedWorkers } = this

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started')
    }

    const traceId = uuid()
    const promises: Promise<O>[] = []

    debug('[%s] callAll start: input=%O', traceId, input)
    for (const worker of workers) {
      promises.push(
        (async (): Promise<O> => {
          const claimedWorker = await this.claimWorker(worker, traceId)
          debug(
            '[%s] callAll call worker: %o',
            traceId,
            this.workerOps.describe(claimedWorker)
          )
          return await this.callWorker(claimedWorker, input, traceId)
        })()
      )
    }

    debug('[%s] callAll wait for results', traceId)
    const results = await Promise.all(promises)
    debug('[%s] callAll got results', traceId)
    return results
  }

  private async callWorker(
    worker: W,
    input: I,
    traceId: string,
    transferList?: (ArrayBuffer | MessagePort)[]
  ): Promise<O> {
    const { promise, resolve, reject } = deferred<{
      output: json.SerializedMessage
    }>()

    try {
      worker.on('message', resolve)
      worker.on('error', reject)
      this.workerOps.send(worker, input, transferList)
      const { output } = await promise
      debug(
        '[%s] call returned: output=%s',
        traceId,
        inspect(output, undefined, undefined, true)
      )
      return json.deserialize(output) as O
    } catch (error) {
      debug(
        '[%s] call failed: error=%s',
        traceId,
        inspect(error, undefined, undefined, true)
      )
      throw error
    } finally {
      worker.off('message', resolve)
      worker.off('error', reject)
      this.releaseWorker(worker, traceId)
    }
  }
}

export function create<I, O, W extends EventEmitter = EventEmitter>(
  workerOps: WorkerOps<I, W>,
  size = cpus().length
): WorkerPool<I, O, W> {
  return new WorkerPool<I, O, W>(workerOps, size)
}

export function inlinePool<I, O>(
  call: (input: I) => Promise<O>
): WorkerPool<I, O, EventEmitter> {
  return create(new InlineWorkerOps<I, O>(call), 1)
}

export function workerThreadPool<I, O>(
  main: string,
  size?: number
): WorkerPool<I, O, Worker> {
  return create(new WorkerThreadWorkerOps<I>(main), size)
}

export function childProcessPool<I, O>(
  main: string,
  size?: number
): WorkerPool<I, O, ChildProcess> {
  return create(new ChildProcessWorkerOps<I>(main), size)
}
