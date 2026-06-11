import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { capturePdfScreenshots } from './pdf';
import type { ScreenshotNamer } from './screenshots';

/** Recursively collects all file paths under `dir`. */
function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFilesRecursive(path) : [path];
  });
}

/**
 * Finds the most recently named report PDF on the mock USB drive whose filename
 * contains `filenameIncludes`, and captures each page as a PNG alongside the UI
 * screenshots. Report filenames are timestamped, so the latest by name is the
 * latest by time.
 */
export async function captureUsbReport(
  name: string,
  namer: ScreenshotNamer,
  options: { filenameIncludes: string }
): Promise<void> {
  const usbPath = getMockFileUsbDriveHandler().getDataPath();
  if (!usbPath) throw new Error('Mock USB drive is not mounted');

  const reportPath = listFilesRecursive(usbPath)
    .filter(
      (path) => path.includes(options.filenameIncludes) && path.endsWith('.pdf')
    )
    .sort()
    .at(-1);
  if (!reportPath) {
    throw new Error(
      `No report matching "${options.filenameIncludes}" found on USB drive`
    );
  }

  const pdfBytes = new Uint8Array(readFileSync(reportPath));
  await capturePdfScreenshots(pdfBytes, name, namer);
}

/** Captures the readiness report PDF saved to the mock USB drive. */
export function captureReadinessReport(
  name: string,
  namer: ScreenshotNamer
): Promise<void> {
  return captureUsbReport(name, namer, {
    filenameIncludes: 'readiness-report__',
  });
}
