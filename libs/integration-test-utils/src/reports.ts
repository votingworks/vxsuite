import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { capturePdfScreenshots } from './pdf';
import type { ScreenshotCounter } from './screenshots';

/** Recursively collects all file paths under `dir`. */
function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFilesRecursive(path) : [path];
  });
}

/**
 * Reads the readiness report PDF most recently saved to the mock USB drive and
 * captures each page as a PNG alongside the UI screenshots.
 */
export async function captureReadinessReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const usbPath = getMockFileUsbDriveHandler().getDataPath();
  if (!usbPath) throw new Error('Mock USB drive is not mounted');

  const reportPath = listFilesRecursive(usbPath)
    .filter(
      (path) => path.includes('readiness-report__') && path.endsWith('.pdf')
    )
    .sort()
    .at(-1);
  if (!reportPath) throw new Error('No readiness report found on USB drive');

  const pdfBytes = new Uint8Array(readFileSync(reportPath));
  await capturePdfScreenshots(pdfBytes, name, counter);
}
