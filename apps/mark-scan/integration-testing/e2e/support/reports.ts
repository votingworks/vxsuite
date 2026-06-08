import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import {
  capturePdfScreenshots,
  type ScreenshotCounter,
} from '@votingworks/integration-test-utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';

/**
 * Captures the readiness report PDF that was saved to the mock USB drive.
 */
export async function captureReadinessReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const dataPath = assertDefined(getMockFileUsbDriveHandler().getDataPath());
  const reportFilename = assertDefined(
    readdirSync(dataPath).find(
      (filename) =>
        filename.startsWith('readiness-report__') && filename.endsWith('.pdf')
    ),
    'expected a readiness report PDF on the mock USB drive'
  );
  const pdfBytes = new Uint8Array(readFileSync(join(dataPath, reportFilename)));
  await capturePdfScreenshots(pdfBytes, name, counter);
}
