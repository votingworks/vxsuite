import { EventEmitter } from 'events';
import { cpus } from 'os';
import { InlineWorkerOps } from './inline_worker_ops';
import { WorkerOps } from './types';
import { WorkerPool } from './worker_pool';

export { type WorkerOps, WorkerPool };

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function create<I, O, W extends EventEmitter = EventEmitter>(
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
