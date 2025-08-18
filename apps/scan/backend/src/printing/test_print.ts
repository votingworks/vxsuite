import { assert } from '@votingworks/basics';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FujitsuPrintResult, Printer } from './printer';

const TEST_PRINT_PDF_PATH = join(__dirname, 'test-print.pdf');

/**
 * Prints a test page for diagnostic purposes. Uses a mock tally
 * report. The exact content of the report is not important, only that it
 * tests printing. Only supported for V4 hardware.
 */
export async function printTestPage({
  printer,
}: {
  printer: Printer;
}): Promise<FujitsuPrintResult> {
  assert(printer.scheme === 'hardware-v4');

  const buffer = await readFile(TEST_PRINT_PDF_PATH);
  return await printer.printPdf(
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  );
}
