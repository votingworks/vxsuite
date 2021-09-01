import { EventEmitter } from 'events'

export interface WorkerOps<I, W extends EventEmitter = EventEmitter> {
  start(): W
  stop(worker: W): void
  send(worker: W, message: I): void
  describe(worker: W): string
}
