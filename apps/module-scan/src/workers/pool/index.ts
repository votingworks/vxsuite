import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { cpus } from 'os';
import { Worker } from 'worker_threads';
import { ChildProcessWorkerOps } from './ChildProcessWorkerOps';
import { InlineWorkerOps } from './InlineWorkerOps';
import { WorkerOps } from './types';
import WorkerPool from './WorkerPool';
import { WorkerThreadWorkerOps } from './WorkerThreadWorkerOps';

export { WorkerOps, WorkerPool };

export function create<I, O, W extends EventEmitter = EventEmitter>(
  workerOps: WorkerOps<I, W>,
  size = cpus().length
): WorkerPool<I, O, W> {
  return new WorkerPool<I, O, W>(workerOps, size);
}

export function inlinePool<I, O>(
  call: (input: I) => Promise<O>
): WorkerPool<I, O, EventEmitter> {
  return create(new InlineWorkerOps<I, O>(call), 1);
}

export function workerThreadPool<I, O>(
  main: string,
  size?: number
): WorkerPool<I, O, Worker> {
  return create(new WorkerThreadWorkerOps<I>(main), size);
}

export function childProcessPool<I, O>(
  main: string,
  size?: number
): WorkerPool<I, O, ChildProcess> {
  return create(new ChildProcessWorkerOps<I>(main), size);
}
