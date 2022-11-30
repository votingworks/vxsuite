import { ok, Result, wrapException } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { EventEmitter } from 'events';
import * as json from '../json_serialization';
import { WorkerOps } from './types';

export class InlineWorkerOps<I, O> implements WorkerOps<I, EventEmitter> {
  private readonly workerInstance = new EventEmitter();

  constructor(private readonly call: (input: I) => Promise<O>) {}

  start(): EventEmitter {
    return this.workerInstance;
  }

  stop(worker: EventEmitter): void {
    assert(worker === this.workerInstance);
    worker.removeAllListeners();
  }

  async send(worker: EventEmitter, message: I): Promise<void> {
    assert(worker === this.workerInstance);
    let output: Result<O, Error>;

    try {
      output = ok(
        await this.call(json.deserialize(json.serialize(message)) as I)
      );
    } catch (error) {
      output = wrapException(error);
    }

    worker.emit('message', json.serialize(output));
  }

  describe(): string {
    return 'Worker { inline: true }';
  }
}
