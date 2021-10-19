import { join } from 'path';
import { Worker } from 'worker_threads';
import { WorkerOps } from './types';
import * as json from '../json-serialization';

export class WorkerThreadWorkerOps<I> implements WorkerOps<I, Worker> {
  constructor(private readonly main: string) {}

  start(): Worker {
    return new Worker(join(__dirname, '../worker-thread-worker.js'), {
      workerData: { __workerPath: this.main },
    });
  }

  stop(worker: Worker): void {
    void worker.terminate();
  }

  send(worker: Worker, message: I): void {
    worker.postMessage(json.serialize(message));
  }

  describe(worker: Worker): string {
    return `Worker { threadId: ${worker.threadId} }`;
  }
}
