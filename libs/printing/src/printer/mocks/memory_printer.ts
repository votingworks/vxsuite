import { MockFunction, mockFunction } from '@votingworks/test-utils';
import { tmpName } from 'tmp-promise';
import { writeFile } from 'fs/promises';
import { rmSync } from 'fs';
import {
  MockPrintJob,
  PrintFunction,
  PrintProps,
  Printer,
  PrinterConfig,
} from '../types';

interface MockedPrinter {
  status: MockFunction<Printer['status']>;
  print: PrintFunction;
}

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

/**
 * Creates a mock of the Printer interface. Stores print jobs as temporary
 * PDF files.
 */
export function createMockPrinterHandler(): MemoryPrinterHandler {
  const printJobs: MockPrintJob[] = [];

  async function mockPrint(props: PrintProps): Promise<void> {
    const { data, ...options } = props;

    const filename = await tmpName({
      prefix: 'mock-print-job',
      postfix: '.pdf',
    });

    await writeFile(filename, data);

    printJobs.push({
      filename,
      options,
    });
  }

  const printer: MockedPrinter = {
    status: mockFunction('status'),
    print: mockPrint,
  } satisfies Printer;

  printer.status.expectRepeatedCallsWith().resolves({
    connected: false,
  });

  return {
    printer,

    connectPrinter(config: PrinterConfig) {
      printer.status.reset();
      printer.status.expectRepeatedCallsWith().resolves({
        connected: true,
        config,
      });
    },

    disconnectPrinter() {
      printer.status.reset();
      printer.status.expectRepeatedCallsWith().resolves({ connected: false });
    },

    getPrintJobHistory() {
      return printJobs;
    },

    getLastPrintPath() {
      return printJobs[printJobs.length - 1]?.filename;
    },

    cleanup() {
      for (const printJob of printJobs) {
        rmSync(printJob.filename);
      }
    },
  };
}
