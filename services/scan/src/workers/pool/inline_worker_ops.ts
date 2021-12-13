import { assert } from "@votingworks/utils";
import { EventEmitter } from 'events';
import * as json from '../json_serialization';
import { WorkerOps } from './types';

export class InlineWorkerOps<I, O> implements WorkerOps<I, EventEmitter> {
  private workerInstance = new EventEmitter();

  constructor(private readonly call: (input: I) => Promise<O>) {}

  start(): EventEmitter {
    return this.workerInstance;
  }

  stop(worker: EventEmitter): void {
    assert.strictEqual(worker, this.workerInstance);
    worker.removeAllListeners();
  }

  async send(worker: EventEmitter, message: I): Promise<void> {
    assert.strictEqual(worker, this.workerInstance);
    try {
      const output = await this.call(
        json.deserialize(json.serialize(message)) as I
      );
      worker.emit('message', { output: json.serialize(output) });
    } catch (error) {
      worker.emit('error', error);
    }
  }

  describe(): string {
    return 'Worker { inline: true }';
  }
}
