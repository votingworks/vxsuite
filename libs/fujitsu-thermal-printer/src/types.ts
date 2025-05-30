import { Result } from '@votingworks/basics';
import { type ImageData } from '@votingworks/image-utils';

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
  printImageData(imageData: ImageData): Promise<PrintResult>;
}
