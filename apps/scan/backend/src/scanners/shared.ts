import { assert, assertDefined } from '@votingworks/basics';
import { Id, SheetInterpretationWithPages } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import {
  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult,
  exportCastVoteRecordsToUsbDrive,
} from '@votingworks/backend';
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

export async function recordAcceptedSheet(
  { continuousExportMutex, store }: Workspace,
  usbDrive: UsbDrive,
  logger: Logger,
  interpretation: InterpretationResult
): Promise<void> {
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

  debug('Stored accepted sheet: %s', sheetId);

  await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
    message: `Queueing accepted sheet ${sheetId} for continuous export to USB drive.`,
  });
  const exportResult = await continuousExportMutex.withLock(async () => {
    await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
      message: `Exporting cast vote record for accepted sheet ${sheetId}...`,
    });
    return await exportCastVoteRecordsToUsbDrive(
      store,
      usbDrive,
      [assertDefined(store.getSheet(sheetId))],
      { scannerType: 'precinct' }
    );
  });
  if (exportResult.isErr()) {
    await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'failure',
      message: `Error exporting cast vote record for accepted sheet ${sheetId}.`,
      errorDetails: JSON.stringify(exportResult.err()),
    });
    // Ensure that the "CVR Sync Required" screen is displayed
    clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();
  } else {
    await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'success',
      message: `Successfully exported cast vote record for accepted sheet ${sheetId}.`,
    });
  }
}

export async function recordRejectedSheet(
  { continuousExportMutex, store }: Workspace,
  usbDrive: UsbDrive,
  logger: Logger,
  interpretation?: InterpretationResult
): Promise<void> {
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

  debug('Stored rejected sheet: %s', sheetId);

  await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
    message: `Queueing rejected sheet ${sheetId} for continuous export to USB drive.`,
  });
  const exportResult = await continuousExportMutex.withLock(async () => {
    await logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
      message: `Exporting images for rejected sheet ${sheetId}...`,
    });
    return await exportCastVoteRecordsToUsbDrive(
      store,
      usbDrive,
      [assertDefined(store.getSheet(sheetId))],
      { scannerType: 'precinct' }
    );
  });
  if (exportResult.isErr()) {
    await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'failure',
      message: `Error exporting images for rejected sheet ${sheetId}.`,
      errorDetails: JSON.stringify(exportResult.err()),
    });
    // Ensure that the "CVR Sync Required" screen is displayed
    clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();
  } else {
    await logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'success',
      message: `Successfully exported images for rejected sheet ${sheetId}.`,
    });
  }
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
