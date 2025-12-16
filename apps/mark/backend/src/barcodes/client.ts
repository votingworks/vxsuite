import { BaseLogger, LogEventId } from '@votingworks/logging';
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:stream';
import util from 'node:util';

import { sleep } from '@votingworks/basics';
import { ScanEvent } from './types';

export class Client extends EventEmitter<{
  error: [Error];
  scan: [Uint8Array];
}> {
  private worker: Worker;
  private restartAttemptCount = 0;

  constructor(private readonly logger: BaseLogger) {
    super();

    this.worker = this.start();
  }

  private readonly onError = (err: Error) => this.emit('error', err);

  private readonly onExit = async (code: number) => {
    this.restartAttemptCount += 1;
    this.logger.log(LogEventId.Info, 'system', {
      disposition: 'failure',
      message: `barcode monitor: unexpected worker exit with code ${code}`,
    });

    if (this.restartAttemptCount > 3) return;

    await sleep(3000);

    this.worker = this.start();
    this.restartAttemptCount = 0;
  };

  private readonly onMessage = (payload: unknown) => {
    if (!isValidPayload(payload)) {
      this.logger.log(LogEventId.BackgroundTaskStatus, 'system', {
        disposition: 'failure',
        message: `barcode monitor: ignoring unexpected message from worker`,
        payload: util.inspect(payload),
      });

      return;
    }

    this.emit('scan', payload.data);
  };

  private readonly onMessageError = (error: Error) => {
    this.logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      disposition: 'failure',
      message: `barcode monitor: error serializing worker message`,
      error: util.inspect(error),
    });
  };

  private readonly onStart = () =>
    this.logger.log(LogEventId.BackgroundTaskStatus, 'system', {
      disposition: 'success',
      message: `barcode monitor: worker started`,
    });

  start(): Worker {
    return new Worker(`${__dirname}/monitor`)
      .on('error', this.onError)
      .on('exit', this.onExit)
      .on('message', this.onMessage)
      .on('messageerror', this.onMessageError)
      .on('online', this.onStart);
  }

  async shutDown(): Promise<number> {
    this.worker.removeAllListeners();
    // Send shutdown message to worker to close HID connection gracefully
    this.worker.postMessage('shutdown');
    // Give the worker a moment to clean up before terminating
    await sleep(100);
    return (await this.worker.terminate()) ?? 0;
  }
}

function isValidPayload(payload: unknown): payload is ScanEvent {
  return (
    !!payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    payload.data instanceof Uint8Array
  );
}
