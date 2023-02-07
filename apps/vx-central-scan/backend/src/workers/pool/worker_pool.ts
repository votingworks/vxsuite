import { Result, deferred, Deferred } from '@votingworks/basics';
import makeDebug from 'debug';
import { EventEmitter } from 'events';
import { inspect } from 'util';
import { v4 as uuid } from 'uuid';
import * as json from '../json_serialization';
import { WorkerOps } from './types';

const debug = makeDebug('scan:pool');

export class WorkerPool<I, O, W extends EventEmitter = EventEmitter> {
  private workers?: Set<W>;
  private claimedWorkers?: Set<W>;
  private readonly outstandingClaims: Array<Deferred<W>> = [];
  private readonly outstandingPerWorkerClaims = new Map<
    W,
    Array<Deferred<W>>
  >();

  constructor(
    private readonly workerOps: WorkerOps<I, W>,
    private readonly size: number
  ) {}

  start(): void {
    if (this.workers) {
      throw new Error('cannot start when already started');
    }

    const workers = new Set<W>();

    for (let i = 0; i < this.size; i += 1) {
      const worker = this.workerOps.start();
      debug('started worker #%d: %o', i, this.workerOps.describe(worker));
      workers.add(worker);
    }

    this.workers = workers;
    this.claimedWorkers = new Set();
    debug('started %d worker(s)', this.workers.size);
  }

  stop(): void {
    const { workers } = this;

    if (!workers) {
      return;
    }

    delete this.workers;

    debug('stopping %d worker(s)', workers.size);
    for (const worker of workers) {
      debug('stopping worker: %o', this.workerOps.describe(worker));
      this.workerOps.stop(worker);
    }
  }

  private async claimWorker(worker: W, traceId: string): Promise<W> {
    debug('[%s] claiming worker: %o', traceId, this.workerOps.describe(worker));
    const { workers, claimedWorkers, outstandingPerWorkerClaims } = this;

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started');
    }

    if (!workers.has(worker)) {
      throw new Error('worker is not owned by this instance');
    }

    if (!claimedWorkers.has(worker)) {
      debug('[%s] worker is available, claiming', traceId);
      claimedWorkers.add(worker);
      return worker;
    }

    debug('[%s] worker is not available now, waiting…', traceId);
    const workerClaims = outstandingPerWorkerClaims.get(worker) ?? [];
    const workerDeferred = deferred<W>();
    workerClaims.push(workerDeferred);
    outstandingPerWorkerClaims.set(worker, workerClaims);
    const awaitedWorker = await workerDeferred.promise;
    debug('[%s] got newly-free worker', traceId);
    return awaitedWorker;
  }

  private async claimFreeWorker(traceId: string): Promise<W> {
    debug('[%s] claiming free worker', traceId);
    const { workers, claimedWorkers } = this;

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started');
    }

    let i = 0;
    for (const worker of workers) {
      if (!claimedWorkers.has(worker)) {
        debug('[%s] worker #%d is available, claiming', traceId, i);
        claimedWorkers.add(worker);
        return worker;
      }

      i += 1;
    }

    debug('[%s] no workers are available now, waiting…', traceId);
    const workerDeferred = deferred<W>();
    this.outstandingClaims.push(workerDeferred);
    const worker = await workerDeferred.promise;
    debug('[%s] got newly-free worker', traceId);
    return worker;
  }

  private releaseWorker(worker: W, traceId: string): void {
    const { workers, claimedWorkers } = this;

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started');
    }

    if (!workers.has(worker)) {
      throw new Error('worker is not owned by this instance');
    }

    if (!claimedWorkers.has(worker)) {
      throw new Error('worker is not currently claimed');
    }

    let i = 0;
    for (const w of workers) {
      if (w === worker) {
        debug(
          '[%s] releasing worker #%d: %o',
          traceId,
          i,
          this.workerOps.describe(worker)
        );
        for (const [cw, workerDeferreds] of this.outstandingPerWorkerClaims) {
          if (cw === worker) {
            const workerDeferred = workerDeferreds.shift();

            if (workerDeferred) {
              debug(
                '[%s] there is an outstanding claim for this worker specifically, passing directly rather than releasing',
                traceId
              );

              workerDeferred.resolve(worker);
              return;
            }
          }
        }

        const workerDeferred = this.outstandingClaims.shift();

        if (workerDeferred) {
          debug(
            '[%s] there is a general outstanding claim, passing worker directly rather than releasing',
            traceId
          );
          workerDeferred.resolve(worker);
          return;
        }

        break;
      }

      i += 1;
    }

    debug('[%s] worker #%d released', traceId, i);
    claimedWorkers.delete(worker);
  }

  async call(input: I): Promise<O> {
    const traceId = uuid();
    debug(
      '[%s] call start: input=%s',
      traceId,
      inspect(input, undefined, undefined, true)
    );
    const worker = await this.claimFreeWorker(traceId);
    debug('[%s] worker claimed: %o', traceId, this.workerOps.describe(worker));
    return await this.callWorker(worker, input, traceId);
  }

  async callAll(input: I): Promise<O[]> {
    const { workers, claimedWorkers } = this;

    if (!workers || !claimedWorkers) {
      throw new Error('not yet started');
    }

    const traceId = uuid();
    const promises: Array<Promise<O>> = [];

    debug('[%s] callAll start: input=%O', traceId, input);
    for (const worker of workers) {
      promises.push(
        (async (): Promise<O> => {
          const claimedWorker = await this.claimWorker(worker, traceId);
          debug(
            '[%s] callAll call worker: %o',
            traceId,
            this.workerOps.describe(claimedWorker)
          );
          return await this.callWorker(claimedWorker, input, traceId);
        })()
      );
    }

    debug('[%s] callAll wait for results', traceId);
    const results = await Promise.all(promises);
    debug('[%s] callAll got results', traceId);
    return results;
  }

  private async callWorker(worker: W, input: I, traceId: string): Promise<O> {
    const { promise, resolve, reject } = deferred<json.SerializedResult>();

    try {
      worker.on('message', resolve);
      worker.on('error', reject);
      this.workerOps.send(worker, input);
      const serializedResult = await promise;
      debug(
        '[%s] call returned: output=%s',
        traceId,
        inspect(serializedResult, undefined, undefined, true)
      );
      return (
        json.deserialize(serializedResult) as Result<O, Error>
      ).unsafeUnwrap();
    } catch (error) {
      debug(
        '[%s] call failed: error=%s',
        traceId,
        inspect(error, undefined, undefined, true)
      );
      throw error;
    } finally {
      worker.off('message', resolve);
      worker.off('error', reject);
      this.releaseWorker(worker, traceId);
    }
  }
}
