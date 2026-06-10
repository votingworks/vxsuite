import {
  captureUsbReport,
  type ScreenshotNamer,
} from '@votingworks/integration-test-utils';

/**
 * Captures the ballots-printed report PDF that was exported to the mock USB
 * drive.
 */
export function capturePrintedBallotsReport(
  name: string,
  namer: ScreenshotNamer
): Promise<void> {
  return captureUsbReport(name, namer, {
    filenameIncludes: 'ballots-printed-report__',
  });
}
