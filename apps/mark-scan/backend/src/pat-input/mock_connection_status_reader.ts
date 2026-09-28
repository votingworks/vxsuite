/* eslint-disable vx/gts-no-public-class-fields */
import type { BaseLogger } from '@votingworks/logging';
import type { PatConnectionStatusReaderInterface } from './connection_status_reader.js';
import { GPIO_PATH_PREFIX } from './constants.js';

// This mock is intended for developing on PAT flows without PAT hardware.
// It's also used to create a no-op mock for tests that just need
// reader.isPatDeviceConnected() to return false.
// For tests that need assertions on PatConnectionStatusReader, consider
// using vi.mock(import('path/to/pat-input/connection_status_reader.js'))
export class MockPatConnectionStatusReader implements PatConnectionStatusReaderInterface {
  private mockConnectedStatus: boolean = false;

  readonly logger: BaseLogger;
  readonly gpioPathPrefix: string;

  constructor(logger: BaseLogger, gpioPathPrefix: string = GPIO_PATH_PREFIX) {
    this.logger = logger;
    this.gpioPathPrefix = gpioPathPrefix;
  }

  open(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  // @coverage-defer
  setConnectionStatus(isConnected: boolean): void {
    this.mockConnectedStatus = isConnected;
  }

  // @coverage-defer
  async isPatDeviceConnected(): Promise<boolean> {
    return Promise.resolve(this.mockConnectedStatus);
  }
}
