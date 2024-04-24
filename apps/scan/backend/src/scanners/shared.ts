import { assert, assertDefined } from '@votingworks/basics';
import { Id, SheetInterpretationWithPages } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { exportCastVoteRecordsToUsbDrive } from '@votingworks/backend';
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

  const exportResult = await continuousExportMutex.withLock(() =>
    exportCastVoteRecordsToUsbDrive(
      store,
      usbDrive,
      [assertDefined(store.getSheet(sheetId))],
      { scannerType: 'precinct' }
    )
  );
  exportResult.unsafeUnwrap();

  debug('Stored accepted sheet: %s', sheetId);
}

export async function recordRejectedSheet(
  { continuousExportMutex, store }: Workspace,
  usbDrive: UsbDrive,
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

  const exportResult = await continuousExportMutex.withLock(() =>
    exportCastVoteRecordsToUsbDrive(
      store,
      usbDrive,
      [assertDefined(store.getSheet(sheetId))],
      { scannerType: 'precinct' }
    )
  );
  exportResult.unsafeUnwrap();

  debug('Stored rejected sheet: %s', sheetId);
}
