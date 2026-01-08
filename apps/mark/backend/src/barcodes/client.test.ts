import { beforeEach, describe, expect, test, vi, afterEach } from 'vitest';
import { mockBaseLogger, BaseLogger } from '@votingworks/logging';

// Mock the worker_threads module before importing the Client
vi.mock('node:worker_threads', async () => {
  const { EventEmitter: EE } = await import('node:events');

  class Worker extends EE {
    postMessage(): void {
      // No-op for testing
    }

    terminate(): Promise<number> {
      return Promise.resolve(0);
    }
  }

  return { Worker };
});

// Import after mocking
// eslint-disable-next-line import/first
import { BarcodeClient } from './client';

describe('Client', () => {
  let logger: BaseLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = mockBaseLogger({ fn: vi.fn });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('creates a worker and sets up event listeners on construction', () => {
    const client = new BarcodeClient(logger);

    // The client should have been created successfully
    expect(client).toBeDefined();

    // Clean up
    void client.shutDown();
  });

  test('emits scan event when worker sends valid scan message', () => {
    const client = new BarcodeClient(logger);
    const scanHandler = vi.fn();
    client.on('scan', scanHandler);

    // Access the worker to emit a message event
    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    const testData = new Uint8Array([1, 2, 3, 4]);
    worker.emit('message', { type: 'scan', data: testData });

    expect(scanHandler).toHaveBeenCalledWith(testData);

    void client.shutDown();
  });

  test('updates connection status when worker sends status message', () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;

    // Initially disconnected
    expect(client.getConnectionStatus()).toEqual(false);

    // Receive connected status
    worker.emit('message', { type: 'status', connected: true });
    expect(client.getConnectionStatus()).toEqual(true);

    // Receive disconnected status
    worker.emit('message', { type: 'status', connected: false });
    expect(client.getConnectionStatus()).toEqual(false);

    void client.shutDown();
  });

  test('ignores invalid messages from worker - null', () => {
    const client = new BarcodeClient(logger);
    const scanHandler = vi.fn();
    client.on('scan', scanHandler);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;

    worker.emit('message', null);

    expect(scanHandler).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        disposition: 'failure',
        message: 'barcode monitor: ignoring unexpected message from worker',
      })
    );

    void client.shutDown();
  });

  test('ignores invalid messages from worker - undefined', () => {
    const client = new BarcodeClient(logger);
    const scanHandler = vi.fn();
    client.on('scan', scanHandler);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;

    worker.emit('message', undefined);

    expect(scanHandler).not.toHaveBeenCalled();

    void client.shutDown();
  });

  test('ignores invalid messages from worker - missing type property', () => {
    const client = new BarcodeClient(logger);
    const scanHandler = vi.fn();
    client.on('scan', scanHandler);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;

    worker.emit('message', { data: new Uint8Array([1, 2, 3]) });

    expect(scanHandler).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        disposition: 'failure',
        message: 'barcode monitor: ignoring unexpected message from worker',
      })
    );

    void client.shutDown();
  });

  test('ignores invalid messages from worker - invalid type', () => {
    const client = new BarcodeClient(logger);
    const scanHandler = vi.fn();
    client.on('scan', scanHandler);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;

    worker.emit('message', { type: 'unknown', data: 'something' });

    expect(scanHandler).not.toHaveBeenCalled();

    void client.shutDown();
  });

  test('emits error event when worker encounters an error', () => {
    const client = new BarcodeClient(logger);
    const errorHandler = vi.fn();
    client.on('error', errorHandler);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    const testError = new Error('test error');
    worker.emit('error', testError);

    expect(errorHandler).toHaveBeenCalledWith(testError);

    void client.shutDown();
  });

  test('logs when worker starts successfully', () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    worker.emit('online');

    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        message: 'barcode monitor: worker started',
        disposition: 'success',
      })
    );

    void client.shutDown();
  });

  test('logs message errors from worker', () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    const testError = new Error('serialization error');
    worker.emit('messageerror', testError);

    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        message: 'barcode monitor: error serializing worker message',
        disposition: 'failure',
      })
    );

    void client.shutDown();
  });

  test('shutDown terminates the worker', async () => {
    const client = new BarcodeClient(logger);

    const shutDownPromise = client.shutDown();
    await vi.advanceTimersByTimeAsync(100);
    const exitCode = await shutDownPromise;

    expect(exitCode).toEqual(0);
  });

  test('shutDown returns 0 when terminate returns undefined', async () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    // Override terminate to return undefined
    worker.terminate = vi.fn().mockResolvedValue(undefined);

    const shutDownPromise = client.shutDown();
    await vi.advanceTimersByTimeAsync(100);
    const exitCode = await shutDownPromise;

    expect(exitCode).toEqual(0);
  });

  test('logs when worker exits unexpectedly', () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker } = client;
    worker.emit('exit', 1);

    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        message: 'barcode monitor: unexpected worker exit with code 1',
        disposition: 'failure',
      })
    );

    void client.shutDown();
  });

  test('restarts worker after exit and resets counter', async () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const initialWorker = client.worker;

    // First exit - increments counter to 1
    initialWorker.emit('exit', 1);
    // @ts-expect-error - accessing private property for testing
    expect(client.restartAttemptCount).toEqual(1);

    // After sleep completes, worker restarts and counter resets to 0
    await vi.advanceTimersByTimeAsync(3000);

    // @ts-expect-error - accessing private property for testing
    expect(client.restartAttemptCount).toEqual(0);

    void client.shutDown();
  });

  test('stops restarting worker after 3 consecutive failures', async () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker: initialWorker } = client;

    // Emit 4 consecutive exits without allowing restart to complete
    // First exit - counter becomes 1
    initialWorker.emit('exit', 1);
    // Second exit (before restart completes) - counter becomes 2
    initialWorker.emit('exit', 1);
    // Third exit - counter becomes 3
    initialWorker.emit('exit', 1);
    // Fourth exit - counter becomes 4, should hit the > 3 return
    initialWorker.emit('exit', 1);

    // @ts-expect-error - accessing private property for testing
    expect(client.restartAttemptCount).toEqual(4);

    // Now advance time - should NOT restart because counter > 3
    await vi.advanceTimersByTimeAsync(3000);

    // @ts-expect-error - accessing private property for testing
    const { worker: finalWorker } = client;
    // Worker should not have changed since we exceeded restart attempts
    expect(finalWorker).toEqual(initialWorker);

    void client.shutDown();
  });

  test('resets restart counter after successful restart', async () => {
    const client = new BarcodeClient(logger);

    // @ts-expect-error - accessing private property for testing
    const { worker: initialWorker } = client;

    // First exit - increments counter to 1
    initialWorker.emit('exit', 1);

    // Wait for restart
    await vi.advanceTimersByTimeAsync(3000);

    // @ts-expect-error - accessing private property for testing
    expect(client.restartAttemptCount).toEqual(0); // Reset after successful restart

    void client.shutDown();
  });
});
