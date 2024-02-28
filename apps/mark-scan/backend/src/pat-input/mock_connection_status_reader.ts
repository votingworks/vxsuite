import { BaseLogger } from '@votingworks/logging';
import { PatConnectionStatusReaderInterface } from './connection_status_reader';

export class MockPatConnectionStatusReader
  implements PatConnectionStatusReaderInterface
{
  private mockConnectedStatus: boolean = false;

  constructor(
    // logger prop must be public to be defined in the interface
    // eslint-disable-next-line vx/gts-no-public-class-fields
    readonly logger: BaseLogger
  ) {}

  open(): Promise<boolean> {
    return Promise.resolve(true);
  }

  setConnectionStatus(isConnected: boolean): void {
    this.mockConnectedStatus = isConnected;
  }

  async isPatDeviceConnected(): Promise<boolean> {
    return Promise.resolve(this.mockConnectedStatus);
  }
}
