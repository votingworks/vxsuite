import { tmpName } from 'tmp-promise';
import { writeFile } from 'fs/promises';
import { rmSync } from 'fs';
import { ok } from '@votingworks/basics';
import { PrinterStatus } from './status';
import { FujitsuThermalPrinterInterface, PrintResult } from './printer';

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

  async function mockPrint(data: Uint8Array): Promise<PrintResult> {
    const filename = await tmpName({
      prefix: 'mock-print-job',
      postfix: '.pdf',
    });

    await writeFile(filename, data);

    mockPrinterState.printPathHistory.push(filename);

    return ok();
  }

  const printer: FujitsuThermalPrinterInterface = {
    getStatus: () => Promise.resolve(mockPrinterState.status),
    print: mockPrint,
    advancePaper: () => Promise.resolve(ok()),
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
    },
  };
}
