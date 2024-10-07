import { LogEventId, Logger } from '@votingworks/logging';
import { ExportCastVoteRecordsToUsbDriveError } from '@votingworks/types';
import {
  extractErrorMessage,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { exportCastVoteRecordsToUsbDrive as exportCastVoteRecordsToUsbDriveBackend } from '@votingworks/backend';
import { UsbDrive } from '@votingworks/usb-drive';
import { Workspace } from './util/workspace';

export type ExportCastVoteRecordsToUsbDriveResult = Result<
  void,
  ExportCastVoteRecordsToUsbDriveError
>;

export async function exportCastVoteRecordsToUsbDrive({
  mode,
  workspace,
  usbDrive,
  logger,
}: {
  mode: 'full_export' | 'polls_closing' | 'recovery_export';
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
}): Promise<ExportCastVoteRecordsToUsbDriveResult> {
  const { store, continuousExportMutex } = workspace;

  await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
    message:
      mode === 'polls_closing'
        ? 'Marking cast vote record export as complete on polls close...'
        : mode === 'recovery_export'
        ? 'Exporting cast vote records that failed to sync...'
        : 'Exporting cast vote records...',
  });

  // Use the continuous export mutex to ensure that any pending continuous export
  // operations finish first
  let exportResult: Result<void, ExportCastVoteRecordsToUsbDriveError>;
  switch (mode) {
    case 'full_export': {
      exportResult = await continuousExportMutex.withLock(() =>
        exportCastVoteRecordsToUsbDriveBackend(
          store,
          usbDrive,
          store.forEachSheet(),
          {
            scannerType: 'precinct',
            isFullExport: true,
          }
        )
      );
      break;
    }
    case 'polls_closing': {
      exportResult = await continuousExportMutex.withLock(() =>
        exportCastVoteRecordsToUsbDriveBackend(store, usbDrive, [], {
          scannerType: 'precinct',
          arePollsClosing: true,
        })
      );
      break;
    }
    case 'recovery_export': {
      exportResult = await continuousExportMutex.withLock(async () => {
        try {
          const recoveryExportResult =
            await exportCastVoteRecordsToUsbDriveBackend(
              store,
              usbDrive,
              store.forEachSheetPendingContinuousExport(),
              { scannerType: 'precinct', isRecoveryExport: true }
            );
          if (recoveryExportResult.isErr()) {
            throw new Error(JSON.stringify(recoveryExportResult.err()));
          }
          return recoveryExportResult;
        } catch (error) {
          // Automatically fall back to a full export if the recovery export fails for any
          // reason. We have to use a try-catch and can't just check for an error Result
          // because certain errors, e.g., errors involving corrupted USB drive file systems,
          // surface as unexpected errors.
          await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
            message: 'Falling back to full export...',
            errorDetails: extractErrorMessage(error),
          });
          const fullExportResult = await exportCastVoteRecordsToUsbDriveBackend(
            store,
            usbDrive,
            store.forEachSheet(),
            { scannerType: 'precinct', isFullExport: true }
          );
          return fullExportResult;
        }
      });
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(mode);
    }
  }

  if (exportResult.isErr()) {
    await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsComplete, {
      disposition: 'failure',
      message:
        mode === 'polls_closing'
          ? 'Error marking cast vote record export as complete on polls close.'
          : 'Error exporting cast vote records.',
      errorDetails: JSON.stringify(exportResult.err()),
    });
  } else {
    await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsComplete, {
      disposition: 'success',
      message:
        mode === 'polls_closing'
          ? 'Successfully marked cast vote record export as complete on polls close.'
          : 'Successfully exported cast vote records.',
    });
  }
  return exportResult;
}
