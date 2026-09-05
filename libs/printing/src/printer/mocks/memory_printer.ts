import { err, ok } from '@votingworks/basics';
import { tmpName } from 'tmp-promise';
import { writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import {
  PrinterConfig,
  PrinterStatus,
  PrintJobId,
  PrintJobStatus,
} from '@votingworks/types';
import { MockPrintJob, PrintProps, Printer } from '../types';
import { createMockJobId, getMockConnectedPrinterStatus } from './fixtures';

/**
 * A mock of the UsbDrive interface. See createMockUsbDrive for details.
 */
export interface MemoryPrinterHandler {
  printer: Printer;
  connectPrinter(config: PrinterConfig): void;
  disconnectPrinter(): void;
  getPrintJobHistory(): MockPrintJob[];
  setJobStatus(jobId: PrintJobId, status: PrintJobStatus): void;
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

  const printer: Printer = {
    status: () => Promise.resolve(mockPrinterState.status),
    print: mockPrint,
    getJobStatus: (jobId) => {
      const status = mockPrinterState.jobs.get(jobId);
      return status
        ? ok(status)
        : err(new Error(`no status tracked for print job ${jobId}`));
    },
    clearJobQueue: () => Promise.resolve(),
  } satisfies Printer;

  return {
    printer,

    connectPrinter(config: PrinterConfig) {
      mockPrinterState.status = getMockConnectedPrinterStatus(config);
    },

    // @coverage-defer
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

    getLastPrintPath() {
      const { printJobHistory } = mockPrinterState;
      return printJobHistory.at(-1)?.filename;
    },

    // @coverage-defer
    cleanup() {
      for (const printJob of mockPrinterState.printJobHistory) {
        rmSync(printJob.filename);
      }
    },
  };
}
