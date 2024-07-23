import { Result } from '@votingworks/basics';

export type ErrorType =
  | 'hardware'
  | 'supply-voltage'
  | 'receive-data'
  | 'temperature'
  | 'disconnected';

export type PrinterStatus =
  | {
      state: 'cover-open';
    }
  | {
      state: 'no-paper';
    }
  | {
      state: 'idle';
    }
  | {
      state: 'error';
      type: ErrorType;
    };

export type PrinterState = PrinterStatus['state'];

export type PrintResult = Result<void, PrinterStatus>;

export interface FujitsuThermalPrinterInterface {
  getStatus(): Promise<PrinterStatus>;
  print(data: Uint8Array): Promise<PrintResult>;
}
