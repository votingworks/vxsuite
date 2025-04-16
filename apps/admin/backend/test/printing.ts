import { MemoryPrinterHandler } from '@votingworks/printing';
import { expect } from 'vitest';
import { REPORT_PRINT_OPTIONS } from '../src/globals';

export function expectLastPrintToHaveUsedReportPrintOptions(
  mockPrintHandler: MemoryPrinterHandler
): void {
  const printJobHistory = mockPrintHandler.getPrintJobHistory();
  expect(printJobHistory[printJobHistory.length - 1]?.options).toEqual(
    REPORT_PRINT_OPTIONS
  );
}
