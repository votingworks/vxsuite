import { type Result, err, ok } from '@votingworks/basics';
import { tmpName } from 'tmp-promise';
import { writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import type {
  PrinterConfig,
  PrinterStatus,
  PrintJobId,
  PrintJobStatus,
} from '@votingworks/types';
import type { MockPrintJob, PrintProps, Printer } from '../types.js';
import { createSettlementRegistry } from '../settlement_registry.js';
import { createMockJobId, getMockConnectedPrinterStatus } from './fixtures.js';

/**
 * A test harness that wraps the Printer interface and provides
 * methods to drive and manage the Printer mock. See {@link detectPrinter}
 * for details.
 */
export interface MemoryPrinterHandler {
  printer: Printer;
  connectPrinter(config: PrinterConfig): void;
  disconnectPrinter(): void;
  getPrintJobHistory(): MockPrintJob[];
  setJobStatus(jobId: PrintJobId, status: PrintJobStatus): void;

  /** The job's status without settlement masking, for driving a watch directly. */
  getRawJobStatus(jobId: PrintJobId): Result<PrintJobStatus, Error>;

  getLastPrintPath(): string | undefined;
  cleanup(): void;
}

interface MockPrinterState {
  status: PrinterStatus;
  printJobHistory: MockPrintJob[];
  jobs: Map<PrintJobId, PrintJobStatus>;
}

/**
 * Creates a mock of the Printer interface. Stores print jobs as temporary
 * PDF files.
 */
export function createMockPrinterHandler(): MemoryPrinterHandler {
  const mockPrinterState: MockPrinterState = {
    status: {
      connected: false,
    },
    printJobHistory: [],
    jobs: new Map(),
  };

  async function mockPrint(props: PrintProps): Promise<PrintJobId> {
    if (!mockPrinterState.status.connected) {
      throw new Error('cannot print without printer connected');
    }

    const { data, ...options } = props;

    const filename = await tmpName({
      prefix: 'mock-print-job',
      postfix: '.pdf',
    });

    await writeFile(filename, data);

    mockPrinterState.printJobHistory.push({
      filename,
      options,
    });

    const jobId = createMockJobId();
    mockPrinterState.jobs.set(jobId, { outcome: 'sent-to-printer' });
    return jobId;
  }

  function getRawStatus(jobId: PrintJobId): Result<PrintJobStatus, Error> {
    const status = mockPrinterState.jobs.get(jobId);
    return status
      ? ok(status)
      : err(new Error(`no status tracked for print job ${jobId}`));
  }

  const settlement = createSettlementRegistry({
    getRawStatus,
    // Late-bound so a spy on `printer.clearJobQueue` is observed.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    clearJobQueue: () => printer.clearJobQueue(),
  });

  const printer: Printer = {
    status: () => Promise.resolve(mockPrinterState.status),
    print: mockPrint,
    getJobStatus: (jobId) => settlement.getJobStatus(jobId),
    awaitJobSettlement: (jobId, onSettled) =>
      settlement.awaitJobSettlement(jobId, onSettled),
    clearJobQueue: () => Promise.resolve(),
  } satisfies Printer;

  return {
    printer,

    connectPrinter(config: PrinterConfig) {
      mockPrinterState.status = getMockConnectedPrinterStatus(config);
    },

    disconnectPrinter() {
      mockPrinterState.status = {
        connected: false,
      };
    },

    getPrintJobHistory() {
      return mockPrinterState.printJobHistory;
    },

    setJobStatus(jobId: PrintJobId, status: PrintJobStatus) {
      mockPrinterState.jobs.set(jobId, status);
    },

    getRawJobStatus(jobId: PrintJobId) {
      return getRawStatus(jobId);
    },

    getLastPrintPath() {
      const { printJobHistory } = mockPrinterState;
      return printJobHistory.at(-1)?.filename;
    },

    cleanup() {
      for (const printJob of mockPrinterState.printJobHistory) {
        rmSync(printJob.filename);
      }
    },
  };
}
