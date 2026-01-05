/* istanbul ignore file - @preserve used only in internal dev and testing */
import { EventEmitter } from 'node:stream';
import { BarcodeReader } from './types';

export class MockBarcodeClient
  extends EventEmitter<{
    error: [Error];
    scan: [Uint8Array];
  }>
  implements BarcodeReader
{
  private connected = true; // default to connected in dev

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  getConnectionStatus(): boolean {
    return this.connected;
  }

  // For future: allow emitting scan data when UI selects an image or payload
  emitScan(data: Uint8Array): void {
    this.emit('scan', data);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async shutDown(): Promise<number> {
    return 0;
  }
}
