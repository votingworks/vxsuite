/* eslint-disable vx/gts-no-public-class-fields */
import { BaseLogger } from '@votingworks/logging';
import { PatConnectionStatusReaderInterface } from './connection_status_reader';
import { GPIO_PATH_PREFIX } from './constants';

// This mock is intended for developing on PAT flows without PAT hardware.
// It's also used to create a no-op mock for tests that just need
// reader.isPatDeviceConnected() to return false.
// For tests that need assertions on PatConnectionStatusReader, consider
// using vi.mock(import('path/to/pat-input/connection_status_reader.js'))
export class MockPatConnectionStatusReader
  implements PatConnectionStatusReaderInterface
{
  private mockConnectedStatus: boolean = false;

  constructor(
    readonly logger: BaseLogger,
    readonly gpioPathPrefix: string = GPIO_PATH_PREFIX
  ) {}

  open(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  setConnectionStatus(isConnected: boolean): void {
    this.mockConnectedStatus = isConnected;
  }

  async isPatDeviceConnected(): Promise<boolean> {
    return Promise.resolve(this.mockConnectedStatus);
  }
}
