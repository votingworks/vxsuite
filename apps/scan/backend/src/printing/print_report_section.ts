import { assert, assertDefined } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName as Feature,
  combineElectionResults,
  getContestsForPrecinct,
  getEmptyElectionResults,
  groupContestsByParty,
  isFeatureFlagEnabled,
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
import {
  Election,
  pollingPlaceContests,
  pollingPlaceFromElection,
} from '@votingworks/types';
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
  const pollingPlaceId = store.getPollingPlaceId();
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  const pollsTransition = store.getLastPollsTransition();
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());
  const allBatches = store.getBatches();

  if (isPollsSuspensionTransition(pollsTransition.type)) {
    debug(
      `polls transition is ${pollsTransition.type}, generating ballot count report`
    );
    /* istanbul ignore next - there should be at least one completed batch but keep the fallback */
    const mostRecentBatchCount =
      pollsTransition.type === 'pause_voting'
        ? [...allBatches]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .find((b) => b.endedAt !== undefined)?.count ?? 0
        : undefined;
    return PrecinctScannerBallotCountReport({
      electionDefinition,
      electionPackageHash,
      pollingPlaceId,
      precinctSelection,
      totalBallotsScanned: pollsTransition.ballotCount,
      mostRecentBatchCount,
      batches: allBatches,
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

  const fullReportContests = isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)
    ? contestsForPollingPlace(electionDefinition.election, pollingPlaceId)
    : getContestsForPrecinct(
        electionDefinition,
        assertDefined(precinctSelection)
      );

  const { partyId, contests: reportSectionContests } = groupContestsByParty(
    election,
    fullReportContests
  )[reportSectionIndex];

  const scannedElectionResults = partyId
    ? scannerResultsByParty.find((results) => results.partyId === partyId) ||
      getEmptyElectionResults(electionDefinition.election, true)
    : scannerResultsCombined;

  const tallyReportBatches =
    pollsTransition.type === 'close_polls' ? allBatches : [];

  return PrecinctScannerTallyReport({
    electionDefinition,
    electionPackageHash,
    pollingPlaceId,
    precinctSelection,
    partyId,
    pollsTransition: pollsTransition.type,
    pollsTransitionedTime: pollsTransition.time,
    contests: reportSectionContests,
    isLiveMode,
    reportPrintedTime: getCurrentTime(),
    precinctScannerMachineId: machineId,
    scannedElectionResults,
    batches: tallyReportBatches,
  });
}

function contestsForPollingPlace(election: Election, placeId?: string) {
  const place = pollingPlaceFromElection(election, assertDefined(placeId));
  return pollingPlaceContests(election, place);
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
