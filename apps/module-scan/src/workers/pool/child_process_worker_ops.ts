import { ChildProcess, fork } from 'child_process';
import { join } from 'path';
import * as json from '../json_serialization';
import { WorkerOps } from './types';

export class ChildProcessWorkerOps<I> implements WorkerOps<I, ChildProcess> {
  constructor(private readonly main: string) {}

  start(): ChildProcess {
    return fork(join(__dirname, '../child-process-worker.js'), [this.main]);
  }

  stop(worker: ChildProcess): void {
    worker.kill();
  }

  send(worker: ChildProcess, message: I): void {
    worker.send(json.serialize(message));
  }

  describe(worker: ChildProcess): string {
    return `ChildProcess { pid: ${worker.pid} }`;
  }
}
