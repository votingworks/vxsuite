import { LogEventId, Logger } from '@votingworks/logging';
import { ExportCastVoteRecordsToUsbDriveError } from '@votingworks/types';
import { Result, throwIllegalValue } from '@votingworks/basics';
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
  mode: 'full_export' | 'polls_closing';
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
}): Promise<ExportCastVoteRecordsToUsbDriveResult> {
  const { store, continuousExportMutex } = workspace;

  await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
    message:
      mode === 'polls_closing'
        ? 'Marking cast vote record export as complete on polls close...'
        : 'Exporting cast vote records...',
  });

  // Use the continuous export mutex to ensure that any pending continuous export
  // operations finish first
  let exportResult: ExportCastVoteRecordsToUsbDriveResult;
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
