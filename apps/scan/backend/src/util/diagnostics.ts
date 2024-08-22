import { assert, throwIllegalValue } from '@votingworks/basics';
import { FujitsuPrinterStatus } from '../printing/printer';

export function testPrintFailureDiagnosticMessage(
  failureStatus: FujitsuPrinterStatus
): string {
  assert(failureStatus.state !== 'idle');
  switch (failureStatus.state) {
    case 'cover-open':
      return 'The printer detected the roll holder was disconnected while printing.';
    case 'no-paper':
      return 'The printer ran out of paper or the paper became misaligned while printing.';
    case 'error':
      switch (failureStatus.type) {
        case 'disconnected':
          return 'The printer was disconnected while printing.';
        case 'temperature':
          return 'The printer overheated while printing.';
        case 'supply-voltage':
          return 'The printer detected a power supply problem while printing.';
        case 'receive-data':
          return 'The printer experienced a data transmission error during printing.';
        case 'hardware':
          return 'The printer experienced an unknown hardware error during printing.';
        /* c8 ignore next 2 */
        default:
          throwIllegalValue(failureStatus.type);
      }
    /* c8 ignore next 3 */
    // eslint-disable-next-line no-fallthrough
    default:
      throwIllegalValue(failureStatus, 'state');
  }
}

export const TEST_PRINT_USER_FAIL_REASON =
  'The user indicated the print was not successful.';

export const TEST_AUDIO_USER_FAIL_REASON =
  'The user indicated audio playback was not successful.';
