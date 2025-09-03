import {
  FujitsuThermalPrinterInterface,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_PRINT_PDF_PATH = join(__dirname, 'test-print.pdf');

/**
 * Prints a test page for diagnostic purposes. Uses a mock tally
 * report. The exact content of the report is not important, only that it
 * tests printing. Only supported for V4 hardware.
 */
export async function printTestPage({
  printer,
}: {
  printer: FujitsuThermalPrinterInterface;
}): Promise<PrintResult> {
  return printer.printPdf(await readFile(TEST_PRINT_PDF_PATH));
}
