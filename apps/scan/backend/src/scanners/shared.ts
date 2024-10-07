import { v4 as uuid } from 'uuid';
import {
  assert,
  assertDefined,
  extractErrorMessage,
  Optional,
  Result,
} from '@votingworks/basics';
import {
  ExportCastVoteRecordsToUsbDriveError,
  Id,
  SheetInterpretationWithPages,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { exportCastVoteRecordsToUsbDrive } from '@votingworks/backend';
import { ImageData } from 'canvas';
import { LogEventId, Logger } from '@votingworks/logging';
import { Store } from '../store';
import { rootDebug } from '../util/debug';
import { Workspace } from '../util/workspace';
import { InterpretationResult } from '../types';

const debug = rootDebug.extend('state-machine');

function storeInterpretedSheet(
  store: Store,
  sheetId: Id,
  interpretation: SheetInterpretationWithPages
): Id {
  const ongoingBatchId = store.getOngoingBatchId();
  assert(typeof ongoingBatchId === 'string');
  const addedSheetId = store.addSheet(
    sheetId,
    ongoingBatchId,
    interpretation.pages
  );
  return addedSheetId;
}

async function exportCastVoteRecordToUsbDriveWithLogging(
  { continuousExportMutex, store }: Workspace,
  usbDrive: UsbDrive,
  sheetId: string,
  acceptedOrRejected: 'accepted' | 'rejected',
  logger: Logger
) {
  // Intentionally don't use the sheet ID in logs as that may inadvertently reveal the order in
  // which ballots were cast
  const operationId = uuid();

  await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
    message: `Queueing ${acceptedOrRejected} sheet for continuous export to USB drive.`,
    operationId,
  });

  let exportResult: Result<void, ExportCastVoteRecordsToUsbDriveError>;
  try {
    exportResult = await continuousExportMutex.withLock(async () => {
      await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
        message: `Exporting cast vote record for ${acceptedOrRejected} sheet to USB drive...`,
        operationId,
      });
      return await exportCastVoteRecordsToUsbDrive(
        store,
        usbDrive,
        [assertDefined(store.getSheet(sheetId))],
        { scannerType: 'precinct' }
      );
    });
    if (exportResult.isErr()) {
      throw new Error(JSON.stringify(exportResult.err()));
    }
  } catch (error) {
    // We have to use a try-catch and can't just check for an error Result because certain errors,
    // e.g., errors involving corrupted USB drive file systems, surface as unexpected errors.
    await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'failure',
      message: `Error exporting cast vote record for ${acceptedOrRejected} sheet to USB drive.`,
      errorDetails: extractErrorMessage(error),
      operationId,
    });
    throw error;
  }
  await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
    disposition: 'success',
    message: `Successfully exported cast vote record for ${acceptedOrRejected} sheet to USB drive.`,
    operationId,
  });
}

export async function recordAcceptedSheet(
  workspace: Workspace,
  usbDrive: UsbDrive,
  interpretation: InterpretationResult,
  logger: Logger
): Promise<void> {
  const { store } = workspace;
  assert(interpretation);
  const { sheetId } = interpretation;
  store.withTransaction(() => {
    storeInterpretedSheet(store, sheetId, interpretation);

    // If we're storing an accepted sheet that needed review, that means that it was "adjudicated"
    // (i.e. the voter said to count it without changing anything).
    if (interpretation.type === 'NeedsReviewSheet') {
      store.adjudicateSheet(sheetId);
    }

    // Marked as complete within exportCastVoteRecordsToUsbDrive
    store.addPendingContinuousExportOperation(sheetId);
  });

  if (store.getIsContinuousExportEnabled()) {
    await exportCastVoteRecordToUsbDriveWithLogging(
      workspace,
      usbDrive,
      sheetId,
      'accepted',
      logger
    );
  }

  debug('Stored accepted sheet: %s', sheetId);
}

export async function recordRejectedSheet(
  workspace: Workspace,
  usbDrive: UsbDrive,
  interpretation: Optional<InterpretationResult>,
  logger: Logger
): Promise<void> {
  const { store } = workspace;
  if (!interpretation) return;
  const { sheetId } = interpretation;
  store.withTransaction(() => {
    storeInterpretedSheet(store, sheetId, interpretation);

    // We want to keep rejected ballots in the store, but not count them. We accomplish this by
    // "deleting" them, which just marks them as deleted and is how we indicate that an interpreted
    // ballot wasn't counted.
    store.deleteSheet(sheetId);

    // Marked as complete within exportCastVoteRecordsToUsbDrive
    store.addPendingContinuousExportOperation(sheetId);
  });

  if (store.getIsContinuousExportEnabled()) {
    await exportCastVoteRecordToUsbDriveWithLogging(
      workspace,
      usbDrive,
      sheetId,
      'rejected',
      logger
    );
  }

  debug('Stored rejected sheet: %s', sheetId);
}

export function cleanLogData(key: string, value: unknown): unknown {
  if (value === undefined) {
    return 'undefined';
  }
  if (value instanceof ImageData) {
    return {
      width: value.width,
      height: value.height,
      data: value.data.length,
    };
  }
  if (value instanceof Error) {
    return { ...value, message: value.message, stack: value.stack };
  }
  if (
    [
      // Protect voter privacy
      'markInfo',
      'votes',
      'unmarkedWriteIns',
      'adjudicationInfo',
      'reasons',
      // Hide large values
      'layout',
      'client',
      'rootListenerRef',
      'imagePath',
      'sheetId',
    ].includes(key)
  ) {
    return '[hidden]';
  }
  return value;
}
