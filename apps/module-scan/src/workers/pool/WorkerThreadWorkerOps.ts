import { join } from 'path'
import { Worker } from 'worker_threads'
import { WorkerOps } from './types'
import * as json from '../json-serialization'

export class WorkerThreadWorkerOps<I> implements WorkerOps<I, Worker> {
  public constructor(private readonly main: string) {}

  public start(): Worker {
    return new Worker(join(__dirname, '../worker-thread-worker.js'), {
      workerData: { __workerPath: this.main },
    })
  }

  public stop(worker: Worker): void {
    void worker.terminate()
  }

  public send(worker: Worker, message: I): void {
    worker.postMessage(json.serialize(message))
  }

  public describe(worker: Worker): string {
    return `Worker { threadId: ${worker.threadId} }`
  }
}
