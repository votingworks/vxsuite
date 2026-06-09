import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import {
  capturePdfScreenshots,
  type ScreenshotCounter,
} from '@votingworks/integration-test-utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';

/**
 * Captures the ballots-printed report PDF that was exported to the mock USB
 * drive.
 */
export async function capturePrintedBallotsReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const dataPath = assertDefined(getMockFileUsbDriveHandler().getDataPath());
  // The report is exported into an election-specific reports subdirectory, so
  // search recursively rather than just the USB root.
  const reportFilename = assertDefined(
    readdirSync(dataPath, { recursive: true })
      .map(String)
      .find(
        (filename) =>
          filename.endsWith('.pdf') &&
          filename.includes('ballots-printed-report__')
      ),
    'expected a ballots-printed report PDF on the mock USB drive'
  );
  const pdfBytes = new Uint8Array(readFileSync(join(dataPath, reportFilename)));
  await capturePdfScreenshots(pdfBytes, name, counter);
}
