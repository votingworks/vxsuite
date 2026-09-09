import { Result } from '@votingworks/basics';
import { type RgbaImageData } from '@votingworks/types';

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
      message?: string;
    };

export type PrinterState = PrinterStatus['state'];

export type PrintResult = Result<void, PrinterStatus>;

export interface FujitsuThermalPrinterInterface {
  getStatus(): Promise<PrinterStatus>;
  printPdf(data: Uint8Array): Promise<PrintResult>;
  printImageData(imageData: RgbaImageData): Promise<PrintResult>;
}
