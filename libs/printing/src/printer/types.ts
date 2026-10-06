import type { Result } from '@votingworks/basics';
import type {
  HmpbBallotPaperSize,
  PrinterStatus,
  PrintJobId,
  PrintJobStatus,
} from '@votingworks/types';

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

export type PaperSize = `${HmpbBallotPaperSize}`;

export interface PrintOptions {
  copies?: number;
  sides?: PrintSides;
  size?: PaperSize;
  raw?: { [key: string]: string };
}

export type PrintProps = PrintOptions & {
  data:
    | Uint8Array
    | NodeJS.ReadableStream
    | Iterable<Uint8Array>
    | AsyncIterable<Uint8Array>;
};

export type PrintFunction = (props: PrintProps) => Promise<PrintJobId>;

/** A running settlement watch, which the caller can cancel. */
export interface JobSettlementMonitor {
  stop(): void;

  /**
   * The job's status as callers should see it. Stays `in-progress` until
   * `onSettled` has finished, so a terminal status implies any bookkeeping
   * `onSettled` performs is already done.
   */
  getStatus(): PrintJobStatus;
}

export interface Printer {
  status: () => Promise<PrinterStatus>;
  print: PrintFunction;

  /**
   * The job's status, held at `in-progress` while a settlement watch started by
   * {@link Printer.awaitJobSettlement} is still running its `onSettled`. A
   * terminal status therefore implies that bookkeeping is complete.
   */
  getJobStatus: (jobId: PrintJobId) => Result<PrintJobStatus, Error>;

  /**
   * Watches a submitted job until it reaches a terminal state, then runs
   * `onSettled` before the job's status is reported as terminal.
   */
  awaitJobSettlement: (
    jobId: PrintJobId,
    onSettled: (status: PrintJobStatus) => Promise<void>
  ) => JobSettlementMonitor;

  clearJobQueue: () => Promise<void>;
}

export interface MockPrintJob {
  filename: string;
  options: PrintOptions;
}
