import { assert } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { Printer } from '@votingworks/printing';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_PRINT_PDF_PATH = join(__dirname, 'test-print.pdf');

/**
 * Prints a test page for diagnostic purposes. Uses a static test ballot PDF.
 */
export async function printTestPage({
  printer,
  logger,
}: {
  printer: Printer;
  logger: Logger;
}): Promise<void> {
  try {
    const data = await readFile(TEST_PRINT_PDF_PATH);
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
      message: 'User started a print diagnostic by printing a test page.',
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
      message: `Error attempting to send test page to the printer: ${error.message}`,
      disposition: 'failure',
    });
  }
}
