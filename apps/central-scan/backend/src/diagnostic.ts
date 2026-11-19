import { LogEventId, type Logger } from '@votingworks/logging';
import {
  runBlankPaperDiagnostic,
  runBlankPaperDiagnosticFromImage,
} from '@votingworks/ballot-interpreter';
import { mapSheet } from '@votingworks/types';
import type { BatchScanner, ScannedSheetInfo } from './batch_scanner.js';
import type { Store } from './store.js';

export type ScanDiagnosticOutcome = 'no-paper' | 'pass' | 'fail';

export async function performScanDiagnostic(
  scanner: BatchScanner,
  store: Store,
  logger: Logger
): Promise<ScanDiagnosticOutcome> {
  await logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
    message:
      'Starting diagnostic scan. Test sheet should be a blank sheet of white paper.',
  });

  const batchControl = scanner.startBatch();
  let sheets: ScannedSheetInfo | undefined;
  try {
    sheets = (await batchControl.scanSheet()).ok();
  } catch {
    // an error here probably means there is no paper, which is handled below
  }
  await batchControl.endBatch();

  if (!sheets) {
    await logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
      disposition: 'failure',
      message: 'No test sheet detected for scan diagnostic.',
    });
    store.addDiagnosticRecord({
      type: 'blank-sheet-scan',
      outcome: 'fail',
    });
    return 'no-paper';
  }

  const [frontPassed, backPassed] =
    'images' in sheets
      ? await mapSheet(sheets.images, (image) =>
          runBlankPaperDiagnosticFromImage(image)
        )
      : await mapSheet([sheets.frontPath, sheets.backPath], (path) =>
          runBlankPaperDiagnostic(path)
        );
  const didPass = frontPassed && backPassed;
  if (didPass) {
    store.addDiagnosticRecord({
      type: 'blank-sheet-scan',
      outcome: 'pass',
    });
    await logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
      disposition: 'success',
      message: 'Diagnostic scan succeeded.',
    });
  } else {
    store.addDiagnosticRecord({
      type: 'blank-sheet-scan',
      outcome: 'fail',
    });
    await logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
      disposition: 'failure',
      message:
        'Diagnostic scan failed. The paper may not be blank or the scanner may need to be cleaned.',
    });
  }
  return didPass ? 'pass' : 'fail';
}
