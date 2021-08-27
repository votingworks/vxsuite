import { ChildProcess, fork } from 'child_process'
import { join } from 'path'
import * as json from '../json-serialization'
import { WorkerOps } from './types'

export class ChildProcessWorkerOps<I> implements WorkerOps<I, ChildProcess> {
  public constructor(private readonly main: string) {}

  public start(): ChildProcess {
    return fork(join(__dirname, '../child-process-worker.js'), [this.main])
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
