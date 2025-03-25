import { err, ok } from '@votingworks/basics';
import { ImageData, writeImageData } from '@votingworks/image-utils';
import { rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpName } from 'tmp-promise';
import {
  FujitsuThermalPrinterInterface,
  PrintResult,
  PrinterStatus,
} from '../types';

/**
 * A mock of the  interface. See for details.
 */
export interface MemoryFujitsuPrinterHandler {
  printer: FujitsuThermalPrinterInterface;
  setStatus(config: PrinterStatus): void;
  getPrintPathHistory(): string[];
  getLastPrintPath(): string | undefined;
  cleanup(): void;
}

interface MockPrinterState {
  status: PrinterStatus;
  printPathHistory: string[];
}

/**
 * Creates a mock of the Printer interface. Stores print jobs as temporary
 * PDF files.
 */
export function createMockFujitsuPrinterHandler(): MemoryFujitsuPrinterHandler {
  const mockPrinterState: MockPrinterState = {
    status: {
      state: 'idle',
    },
    printPathHistory: [],
  };

  async function mockPrintPdf(data: Uint8Array): Promise<PrintResult> {
    if (mockPrinterState.status.state !== 'idle') {
      return err(mockPrinterState.status);
    }

    const filename = await tmpName({
      prefix: 'mock-print-job',
      postfix: '.pdf',
    });

    await writeFile(filename, data);

    mockPrinterState.printPathHistory.push(filename);

    return ok();
  }

  async function mockPrintImageData(
    imageData: ImageData
  ): Promise<PrintResult> {
    if (mockPrinterState.status.state !== 'idle') {
      return err(mockPrinterState.status);
    }

    const filename = await tmpName({
      prefix: 'mock-print-job',
      postfix: '.png',
    });

    await writeImageData(filename, imageData);

    mockPrinterState.printPathHistory.push(filename);

    return ok();
  }

  const printer: FujitsuThermalPrinterInterface = {
    getStatus: () => Promise.resolve(mockPrinterState.status),
    printPdf: mockPrintPdf,
    printImageData: mockPrintImageData,
  };

  return {
    printer,

    setStatus(status: PrinterStatus) {
      mockPrinterState.status = status;
    },

    getPrintPathHistory() {
      return mockPrinterState.printPathHistory;
    },

    getLastPrintPath() {
      return mockPrinterState.printPathHistory.slice(-1)[0];
    },

    cleanup() {
      for (const path of mockPrinterState.printPathHistory) {
        rmSync(path);
      }
      mockPrinterState.printPathHistory = [];
    },
  };
}
