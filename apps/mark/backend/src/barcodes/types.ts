export interface ScanEvent {
  type: 'scan';
  data: Uint8Array;
}

export interface StatusMessage {
  type: 'status';
  connected: boolean;
}

export type WorkerMessage = ScanEvent | StatusMessage;

export interface BarcodeReaderEvents {
  scan: [Uint8Array];
  error: [Error];
}

export interface BarcodeReader {
  getConnectionStatus(): boolean;
  on<K extends keyof BarcodeReaderEvents>(
    event: K,
    listener: (...args: BarcodeReaderEvents[K]) => void
  ): this;
  shutDown(): Promise<number>;
}
