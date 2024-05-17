import memoizeOne from 'memoize-one';
import { PollsTransitionType } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { isPollsSuspensionTransition } from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReports,
} from '@votingworks/ui';
import {
  DEFAULT_MARGIN_DIMENSIONS,
  MarginDimensions,
  PAPER_DIMENSIONS,
  renderToPdf,
} from '@votingworks/printing';
import { PrintResult } from '@votingworks/fujitsu-thermal-printer';
import { Store } from '../store';
import { getMachineConfig } from '../machine_config';
import { getScannerResults } from '../util/results';
import { getCurrentTime } from '../util/get_current_time';
import { rootDebug } from '../util/debug';
import { Printer } from './printer';

const debug = rootDebug.extend('print-report-section');

async function getReportSections(
  store: Store,
  pollsTransitionType: PollsTransitionType,
  pollsTransitionBallotCount: number,
  pollsTransitionTime: number
): Promise<JSX.Element[]> {
  debug('generating all report sections...');
  const electionDefinition = store.getElectionDefinition();
  const precinctSelection = store.getPrecinctSelection();
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  assert(electionDefinition);
  assert(precinctSelection);

  const scannerResultsByParty = await getScannerResults({ store });

  if (isPollsSuspensionTransition(pollsTransitionType)) {
    return [
      PrecinctScannerBallotCountReport({
        electionDefinition,
        precinctSelection,
        totalBallotsScanned: pollsTransitionBallotCount,
        pollsTransition: pollsTransitionType,
        pollsTransitionedTime: pollsTransitionTime,
        reportPrintedTime: getCurrentTime(),
        isLiveMode,
        precinctScannerMachineId: machineId,
      }),
    ];
  }

  return PrecinctScannerTallyReports({
    electionDefinition,
    precinctSelection,
    isLiveMode,
    pollsTransition: pollsTransitionType,
    pollsTransitionedTime: pollsTransitionTime,
    reportPrintedTime: getCurrentTime(),
    precinctScannerMachineId: machineId,
    electionResultsByParty: scannerResultsByParty,
  });
}

const getReportSectionsMemoized = memoizeOne(getReportSections);

async function getReportSection(
  store: Store,
  index: number
): Promise<JSX.Element> {
  debug(`getting report section ${index}...`);
  const pollsTransition = store.getLastPollsTransition();
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());

  const allSections = await getReportSectionsMemoized(
    store,
    pollsTransition.type,
    pollsTransition.ballotCount,
    pollsTransition.time
  );

  return allSections[index];
}

/**
 * While loaded, the paper must be fed through the paper output slot with the
 * tear bar. There is a distance between the output slot and the printhead, however,
 * which means that a certain chunk at the top of each page is unprintable. To
 * account for this, we redistribute a certain amount of the top margin to the
 * bottom margin. This must be calibrated based off of the hardware.
 */
const VERTICAL_MARGIN_ADJUSTMENT_INCHES = 0.32;
const ADJUSTED_TOP_MARGIN = Math.max(
  DEFAULT_MARGIN_DIMENSIONS.top - VERTICAL_MARGIN_ADJUSTMENT_INCHES,
  0
);
const ADJUSTED_BOTTOM_MARGIN = Math.max(
  DEFAULT_MARGIN_DIMENSIONS.bottom + VERTICAL_MARGIN_ADJUSTMENT_INCHES,
  0
);
const ADJUSTED_MARGIN_DIMENSIONS: MarginDimensions = {
  ...DEFAULT_MARGIN_DIMENSIONS,
  top: ADJUSTED_TOP_MARGIN,
  bottom: ADJUSTED_BOTTOM_MARGIN,
};

export async function printReportSection({
  store,
  printer,
  index,
}: {
  store: Store;
  printer: Printer;
  index: number;
}): Promise<PrintResult> {
  assert(printer.scheme === 'hardware-v4');
  const section = await getReportSection(store, index);
  const data = await renderToPdf({
    document: section,
    paperDimensions: PAPER_DIMENSIONS.LetterRoll,
    marginDimensions: ADJUSTED_MARGIN_DIMENSIONS,
  });
  return printer.print(data);
}
