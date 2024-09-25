import { renderToPdf } from '@votingworks/printing';
import { assert, assertDefined } from '@votingworks/basics';
import { isPollsSuspensionTransition } from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReports,
} from '@votingworks/ui';
import { getDocument } from 'pdfjs-dist';
import { Store } from '../store';
import { rootDebug } from '../util/debug';
import { getMachineConfig } from '../machine_config';
import { getScannerResults } from '../util/results';
import { Printer } from './printer';
import { getCurrentTime } from '../util/get_current_time';

const debug = rootDebug.extend('print-full-report');

/**
 * Sends the full report (if a primary tally report, all sections) to the printer
 * and returns the total number of pages. Used for V3 hardware.
 */
export async function printFullReport({
  store,
  printer,
}: {
  store: Store;
  printer: Printer;
}): Promise<number> {
  const { electionDefinition, electionPackageHash } = assertDefined(
    store.getElectionRecord()
  );
  const precinctSelection = store.getPrecinctSelection();
  const pollsTransition = store.getLastPollsTransition();
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  assert(precinctSelection);
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());

  const scannerResultsByParty = await getScannerResults({ store });

  const report = (() => {
    if (isPollsSuspensionTransition(pollsTransition.type)) {
      debug('printing ballot count report...');
      return PrecinctScannerBallotCountReport({
        electionDefinition,
        electionPackageHash,
        precinctSelection,
        totalBallotsScanned: pollsTransition.ballotCount,
        pollsTransition: pollsTransition.type,
        pollsTransitionedTime: pollsTransition.time,
        reportPrintedTime: getCurrentTime(),
        isLiveMode,
        precinctScannerMachineId: machineId,
      });
    }

    debug('printing tally report...');

    return PrecinctScannerTallyReports({
      electionDefinition,
      electionPackageHash,
      precinctSelection,
      isLiveMode,
      pollsTransition: pollsTransition.type,
      pollsTransitionedTime: pollsTransition.time,
      reportPrintedTime: getCurrentTime(),
      precinctScannerMachineId: machineId,
      electionResultsByParty: scannerResultsByParty,
    });
  })();

  const pdfData = (await renderToPdf({ document: report })).unsafeUnwrap();
  await printer.print(pdfData);

  const pdfDocument = await getDocument(pdfData).promise;
  return pdfDocument.numPages;
}
