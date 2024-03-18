import { Printer, renderToPdf } from '@votingworks/printing';
import { assert } from '@votingworks/basics';
import { isPollsSuspensionTransition } from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReports,
} from '@votingworks/ui';
import { getDocument } from 'pdfjs-dist';
import { Store } from './store';
import { rootDebug } from './util/debug';
import { getMachineConfig } from './machine_config';
import { getScannerResults } from './util/results';
import { getCurrentTime } from './util/get_current_time';

const debug = rootDebug.extend('print-report');

export async function printReport({
  store,
  printer,
}: {
  store: Store;
  printer: Printer;
}): Promise<number> {
  const electionDefinition = store.getElectionDefinition();
  const precinctSelection = store.getPrecinctSelection();
  const pollsTransition = store.getLastPollsTransition();
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  assert(electionDefinition);
  assert(precinctSelection);
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());

  const scannerResultsByParty = await getScannerResults({ store });

  const report = (() => {
    if (isPollsSuspensionTransition(pollsTransition.type)) {
      debug('printing ballot count report...');
      return PrecinctScannerBallotCountReport({
        electionDefinition,
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
      precinctSelection,
      isLiveMode,
      pollsTransition: pollsTransition.type,
      pollsTransitionedTime: pollsTransition.time,
      reportPrintedTime: getCurrentTime(),
      precinctScannerMachineId: machineId,
      electionResultsByParty: scannerResultsByParty,
    });
  })();

  const pdfData = await renderToPdf({ document: report });
  await printer.print({ data: pdfData });

  const pdfDocument = await getDocument(pdfData).promise;
  return pdfDocument.numPages;
}
