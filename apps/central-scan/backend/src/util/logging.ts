import { LogEventId, Logger } from '@votingworks/logging';
import {
  AdjudicationReason,
  BatchInfo,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';

export function logBatchComplete(
  logger: Logger,
  batch: BatchInfo
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchComplete, {
    disposition: 'success',
    message: `Scanning batch ${batch.id} successfully completed scanning ${batch.count} sheets.`,
    batchId: batch.id,
    sheetCount: batch.count,
    scanningEndedAt: batch.endedAt,
  });
}

export function logScanBatchContinueSuccess(
  logger: Logger,
  forceAccept: boolean
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
    disposition: 'success',
    message: forceAccept
      ? 'Sheet tabulated with warnings; the batch is paused.'
      : 'User indicated removing the sheet from tabulation; the batch is paused without the sheet.',
    sheetRemoved: !forceAccept,
  });
}

export function logScanBatchContinueFailure(
  logger: Logger,
  error: Error
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
    disposition: 'failure',
    message: `User attempt to continue scanning failed: ${error.message}`,
  });
}

export function logBatchStartSuccess(
  logger: Logger,
  batchId: BatchInfo['id']
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchInit, {
    disposition: 'success',
    message: `User has begun scanning a new batch with ID: ${batchId}`,
    batchId,
  });
}

export function logBatchStartFailure(
  logger: Logger,
  error: Error
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchInit, {
    disposition: 'failure',
    message: `User attempt to start scanning failed: ${error.message}`,
  });
}

export function logScanSheetSuccess(
  logger: Logger,
  batch: BatchInfo
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanSheetComplete, {
    disposition: 'success',
    message: `Sheet number ${batch.count} in batch ${batch.id} scanned successfully`,
    batchId: batch.id,
    sheetCount: batch.count,
  });
}

const SHEET_ADJUDICATION_ERRORS: ReadonlyArray<PageInterpretation['type']> = [
  'InvalidTestModePage',
  'InvalidBallotHashPage',
  'UnreadablePage',
  'BlankPage',
];

export async function logSheetAdjudicationInfo(
  logger: Logger,
  [front, back]: SheetOf<PageInterpretation>
): Promise<void> {
  const errorInterpretations = SHEET_ADJUDICATION_ERRORS.filter(
    (e) => e === front.type || e === back.type
  );
  if (errorInterpretations.length > 0) {
    await logger.logAsCurrentRole(LogEventId.ScanAdjudicationInfo, {
      message:
        'Sheet scanned that has unresolvable errors. Sheet must be removed to continue scanning.',
      adjudicationTypes: errorInterpretations.join(', '),
    });
    return;
  }

  const adjudicationTypes = new Set<AdjudicationReason>();
  for (const page of [front, back]) {
    if (
      page.type === 'InterpretedHmpbPage' &&
      page.adjudicationInfo.requiresAdjudication
    ) {
      for (const reason of page.adjudicationInfo.enabledReasons) {
        adjudicationTypes.add(reason);
      }
    }
  }
  if (adjudicationTypes.size === 0) {
    return;
  }
  await logger.logAsCurrentRole(LogEventId.ScanAdjudicationInfo, {
    message:
      'Sheet scanned has warnings (ex: undervotes or overvotes). The user can either tabulate it as is or remove the ballot to continue scanning.',
    adjudicationTypes: [...adjudicationTypes].join(', '),
  });
}
