import { PrinterStatus } from '@votingworks/types';
import { Buffer } from 'node:buffer';

export enum PrintSides {
  /**
   * One page per sheet, aka simplex or "Duplex=None".
   */
  OneSided = 'one-sided',

  /**
   * Two pages per sheet, aka "Duplex=DuplexNoTumble". This option prints such
   * that a right-side up portrait sheet flipped over on the long edge remains
   * right-side up, i.e. a regular left-to-right book.
   */
  TwoSidedLongEdge = 'two-sided-long-edge',

  /**
   * Two pages per sheet, aka "Duplex=DuplexTumble". This option prints such
   * that a right-side up portrait sheet flipped over on the short edge remains
   * right-side up, i.e. a bound-at-the-top ring binder.
   */
  TwoSidedShortEdge = 'two-sided-short-edge',
}

export interface PrintOptions {
  copies?: number;
  sides?: PrintSides;
  raw?: { [key: string]: string };
}

export type PrintProps = PrintOptions & {
  data:
    | Buffer
    | NodeJS.ReadableStream
    | Iterable<Buffer>
    | AsyncIterable<Buffer>;
};

export type PrintFunction = (props: PrintProps) => Promise<void>;

export interface Printer {
  status: () => Promise<PrinterStatus>;
  print: PrintFunction;
}

export interface MockPrintJob {
  filename: string;
  options: PrintOptions;
}
