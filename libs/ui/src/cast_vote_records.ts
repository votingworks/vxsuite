import { throwIllegalValue } from '@votingworks/basics';
import {
  ExportCastVoteRecordsToUsbDriveError,
  SheetOf,
} from '@votingworks/types';

function sheetValuesToString<T extends string | number>(
  sheetValues: SheetOf<T>
): string {
  return `front = ${sheetValues[0]}, back = ${sheetValues[1]}`;
}

export function userReadableMessageFromExportError(
  error: ExportCastVoteRecordsToUsbDriveError
): string {
  switch (error.type) {
    case 'file-system-error':
    case 'permission-denied': {
      return 'Unable to write to USB drive.';
    }
    case 'missing-usb-drive': {
      return 'No USB drive detected.';
    }
    case 'relative-file-path': {
      return 'Invalid file path.';
    }
    case 'invalid-sheet': {
      return (() => {
        switch (error.subType) {
          case 'incompatible-interpretation-types': {
            return `Encountered an invalid sheet with incompatible interpretation types: ${sheetValuesToString(
              error.interpretationTypes
            )}.`;
          }
          case 'mismatched-ballot-style-ids': {
            return `Encountered an invalid sheet with mismatched ballot styles: ${sheetValuesToString(
              error.ballotStyleIds
            )}.`;
          }
          case 'mismatched-ballot-types': {
            return `Encountered an invalid sheet with mismatched ballot types: ${sheetValuesToString(
              error.ballotTypes
            )}.`;
          }
          case 'mismatched-ballot-hashes': {
            return `Encountered an invalid sheet with mismatched ballot hashes: ${sheetValuesToString(
              error.ballotHashes
            )}.`;
          }
          case 'mismatched-precinct-ids': {
            return `Encountered an invalid sheet with mismatched precincts: ${sheetValuesToString(
              error.precinctIds
            )}.`;
          }
          case 'non-consecutive-page-numbers': {
            return `Encountered an invalid sheet with non-consecutive page numbers: ${sheetValuesToString(
              error.pageNumbers
            )}.`;
          }
          /* istanbul ignore next: Compile-time check for completeness */
          default: {
            throwIllegalValue(error, 'subType');
          }
        }
      })();
    }
    case 'recovery-export-error': {
      return 'Recovery export failed.';
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(error, 'type');
    }
  }
}
