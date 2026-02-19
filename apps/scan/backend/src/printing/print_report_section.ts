import { assert, assertDefined } from '@votingworks/basics';
import {
  combineElectionResults,
  getContestsForPrecinct,
  getEmptyElectionResults,
  groupContestsByParty,
  isPollsSuspensionTransition,
} from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReport,
} from '@votingworks/ui';
import { PAPER_DIMENSIONS, renderToPdf } from '@votingworks/printing';
import {
  FujitsuThermalPrinterInterface,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import { Store } from '../store';
import { getMachineConfig } from '../machine_config';
import { getScannerResultsMemoized } from '../util/results';
import { getCurrentTime } from '../util/get_current_time';
import { rootDebug } from '../util/debug';
import { ADJUSTED_MARGIN_DIMENSIONS } from './constants';

const debug = rootDebug.extend('print-report-section');

async function getReportSection(
  store: Store,
  reportSectionIndex: number
): Promise<JSX.Element> {
  const { electionDefinition, electionPackageHash } = assertDefined(
    store.getElectionRecord()
  );
  const { election } = electionDefinition;
  const precinctSelection = store.getPrecinctSelection();
  assert(precinctSelection);
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  const pollsTransition = store.getLastPollsTransition();
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());

  if (isPollsSuspensionTransition(pollsTransition.type)) {
    debug(
      `polls transition is ${pollsTransition.type}, generating ballot count report`
    );
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
  debug(`polls transition is ${pollsTransition.type}, generating tally report`);

  const scannerResultsByParty = await getScannerResultsMemoized({ store });
  const scannerResultsCombined = combineElectionResults({
    election: electionDefinition.election,
    allElectionResults: scannerResultsByParty,
  });

  const fullReportContests = getContestsForPrecinct(
    electionDefinition,
    precinctSelection
  );

  const { partyId, contests: reportSectionContests } = groupContestsByParty(
    election,
    fullReportContests
  )[reportSectionIndex];

  const scannedElectionResults = partyId
    ? scannerResultsByParty.find((results) => results.partyId === partyId) ||
      getEmptyElectionResults(electionDefinition.election, true)
    : scannerResultsCombined;

  return PrecinctScannerTallyReport({
    electionDefinition,
    electionPackageHash,
    precinctSelection,
    partyId,
    pollsTransition: pollsTransition.type,
    pollsTransitionedTime: pollsTransition.time,
    contests: reportSectionContests,
    isLiveMode,
    reportPrintedTime: getCurrentTime(),
    precinctScannerMachineId: machineId,
    scannedElectionResults,
  });
}

export async function printReportSection({
  store,
  printer,
  index,
}: {
  store: Store;
  printer: FujitsuThermalPrinterInterface;
  index: number;
}): Promise<PrintResult> {
  const section = await getReportSection(store, index);
  const data = (
    await renderToPdf({
      document: section,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
      marginDimensions: ADJUSTED_MARGIN_DIMENSIONS,
    })
  ).unsafeUnwrap();
  return printer.printPdf(data);
}
