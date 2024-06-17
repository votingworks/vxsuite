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
          return 'The printer is open.';
        case 'no-paper':
          return 'The printer is not loaded with paper.';
        case 'error':
          switch (status.type) {
            case 'disconnected':
              return 'The printer is disconnected.';
            case 'temperature':
            case 'supply-voltage':
            case 'receive-data':
            case 'hardware':
              return 'The printer encountered an error.';
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
