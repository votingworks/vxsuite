import { tmpName } from 'tmp-promise';
import { writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { PrinterConfig, PrinterStatus } from '@votingworks/types';
import { MockPrintJob, PrintProps, Printer } from '../types';
import { getMockConnectedPrinterStatus } from './fixtures';

/**
 * A mock of the UsbDrive interface. See createMockUsbDrive for details.
 */
export interface MemoryPrinterHandler {
  printer: Printer;
  connectPrinter(config: PrinterConfig): void;
  disconnectPrinter(): void;
  getPrintJobHistory(): MockPrintJob[];
  getLastPrintPath(): string | undefined;
  cleanup(): void;
}

interface MockPrinterState {
  status: PrinterStatus;
  printJobHistory: MockPrintJob[];
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
  };

  async function mockPrint(props: PrintProps): Promise<void> {
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
  }

  const printer: Printer = {
    status: () => Promise.resolve(mockPrinterState.status),
    print: mockPrint,
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
