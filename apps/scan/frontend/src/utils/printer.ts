import { throwIllegalValue } from '@votingworks/basics';
import type { PrinterStatus } from '@votingworks/scan-backend';

export type PollsFlowPrinterSummary =
  | {
      ready: true;
    }
  | {
      ready: false;
      alertText: string;
    };

export function getPollsFlowPrinterAlertText(
  status: PrinterStatus
): string | undefined {
  switch (status.scheme) {
    case 'hardware-v4':
      switch (status.state) {
        case 'idle':
          return undefined;
        case 'cover-open':
          return 'The paper roll holder is not attached to the printer';
        case 'no-paper':
          return 'The printer is not loaded with paper';
        case 'error':
          switch (status.type) {
            case 'disconnected':
              return 'The printer is disconnected';
            case 'temperature':
            case 'supply-voltage':
            case 'receive-data':
            case 'hardware':
              return 'The printer encountered an error';
            // istanbul ignore next
            default:
              throwIllegalValue(status.type);
          }
        // istanbul ignore next
        // eslint-disable-next-line no-fallthrough
        default:
          throwIllegalValue(status);
      }
    // eslint-disable-next-line no-fallthrough
    case 'hardware-v3':
      return !status.connected ? 'Attach printer to continue.' : undefined;
    // istanbul ignore next
    default:
      throwIllegalValue(status);
  }
}

export function getPollsFlowPrinterSummary(
  status: PrinterStatus
): PollsFlowPrinterSummary {
  const alertText = getPollsFlowPrinterAlertText(status);
  return alertText === undefined
    ? { ready: true }
    : { ready: false, alertText };
}

export const PRINTER_FLOW_STRINGS = {
  removePaperRollHolderTitle: 'Remove Paper Roll Holder',
  removePaperRollHolderContent:
    'Open the access door to reveal the printer. Press the green lever on the paper roll holder to separate it from the printer.',
  prePrintErrorTitle: 'Printer Error',
  prePrintErrorContent: 'The printer has encountered an unexpected error.',
  loadNewPaperRollTitle: 'Load New Paper Roll',
  loadNewPaperRollContent:
    'Slide a new roll of paper onto the roll holder. Unroll enough paper to pull it over the tear bar and toward you. Holding the end of the paper past the tear bar with your thumbs, push the roll holder back onto the printer so it clicks into place.',
  noPaperDetectedAfterReloadTitle: 'No Paper Detected',
  noPaperDetectedAfterReloadContent:
    'The paper roll holder was reattached but no paper is detected. It may not be loaded correctly. Try reloading the paper roll.',
  paperLoadedTitle: 'Paper Loaded',
  paperLoadedContentPollWorker:
    'Paper is now loaded. You may continue printing reports.',
  paperLoadedContentElectionManager:
    'Paper is now loaded. To ensure the paper is correctly loaded, the printer will print a test page.',
  testPrintNoPaperFailureTitle: 'Print Failed',
  testPrintNoPaperFailureContent:
    'The print stopped because paper is no longer detected in the printer. The paper may be misaligned. Try reloading the paper roll.',
  testPrintHardFailureTitle: 'Printer Error',
  testPrintHardFailureContent:
    'The printer has encountered an unexpected error while printing.',
  testPrintSuccessTitle: 'Test Page Printed',
  testPrintSuccessContent:
    'Remove and inspect the test page to confirm it printed legibly. If it did not, try reloading the paper roll.',
} as const;
