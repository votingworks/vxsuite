import { assert, assertDefined } from '@votingworks/basics';
import {
  combineElectionResults,
  getEmptyElectionResults,
  groupContestsByParty,
  isPollsSuspensionTransition,
  PartyWithContests,
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
  PollsSuspensionTransitionType,
  StandardPollsTransitionType,
} from '@votingworks/types';
import { Store } from '../store';
import { getMachineConfig } from '../machine_config';
import { getScannerResultsMemoized } from '../util/results';
import { getCurrentTime } from '../util/get_current_time';
import { rootDebug } from '../util/debug';
import { ADJUSTED_MARGIN_DIMENSIONS } from './constants';

const debug = rootDebug.extend('print-report-section');

/**
 * A single section of a polls report — i.e. one page printed by one
 * {@link printReportSection} call. A polls paused/resumed report is a single
 * ballot count section; a tally report (open/close) has one section per party
 * (plus a nonpartisan section).
 */
type ReportSection =
  | { type: 'ballotCount'; pollsTransitionType: PollsSuspensionTransitionType }
  | ({
      type: 'tally';
      pollsTransitionType: StandardPollsTransitionType;
    } & PartyWithContests);

/**
 * The sections that make up the current polls report.
 */
function getReportSections(store: Store): ReportSection[] {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const pollsTransition = store.getLastPollsTransition();
  assert(pollsTransition);
  const pollsTransitionType = pollsTransition.type;

  if (isPollsSuspensionTransition(pollsTransitionType)) {
    return [{ type: 'ballotCount', pollsTransitionType }];
  }

  const fullReportContests = contestsForPollingPlace(
    election,
    store.getPollingPlaceId()
  );
  return groupContestsByParty(election, fullReportContests).map(
    (partyWithContests) => ({
      type: 'tally',
      pollsTransitionType,
      ...partyWithContests,
    })
  );
}

async function getReportSection(
  store: Store,
  reportSectionIndex: number
): Promise<JSX.Element> {
  const { electionDefinition, electionPackageHash } = assertDefined(
    store.getElectionRecord()
  );
  const pollingPlaceId = store.getPollingPlaceId();
  const isLiveMode = !store.getTestMode();
  const { machineId } = getMachineConfig();
  const pollsTransition = store.getLastPollsTransition();
  assert(pollsTransition);
  assert(pollsTransition.ballotCount === store.getBallotsCounted());
  const allBatches = store.getBatches();

  const reportSections = getReportSections(store);
  assert(
    reportSectionIndex < reportSections.length,
    `report section index ${reportSectionIndex} is out of range`
  );
  const reportSection = reportSections[reportSectionIndex];

  if (reportSection.type === 'ballotCount') {
    debug(
      `polls transition is ${pollsTransition.type}, generating ballot count report`
    );
    /* istanbul ignore next - there should be at least one completed batch but keep the fallback */
    const mostRecentBatchCount =
      reportSection.pollsTransitionType === 'pause_voting'
        ? [...allBatches]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .find((b) => b.endedAt !== undefined)?.count ?? 0
        : undefined;
    return PrecinctScannerBallotCountReport({
      electionDefinition,
      electionPackageHash,
      pollingPlaceId,
      totalBallotsScanned: pollsTransition.ballotCount,
      mostRecentBatchCount,
      batches: allBatches,
      pollsTransition: reportSection.pollsTransitionType,
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

  const { partyId, contests: reportSectionContests } = reportSection;

  const scannedElectionResults = partyId
    ? scannerResultsByParty.find((results) => results.partyId === partyId) ||
      getEmptyElectionResults(electionDefinition.election, true)
    : scannerResultsCombined;

  const tallyReportBatches =
    reportSection.pollsTransitionType === 'close_polls' ? allBatches : [];

  return PrecinctScannerTallyReport({
    electionDefinition,
    electionPackageHash,
    pollingPlaceId,
    partyId,
    pollsTransition: reportSection.pollsTransitionType,
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
}): Promise<{ printResult: PrintResult; numberOfSections: number }> {
  const reportSections = getReportSections(store);
  const section = await getReportSection(store, index);
  const data = (
    await renderToPdf({
      document: section,
      paperDimensions: PAPER_DIMENSIONS.LetterRoll,
      marginDimensions: ADJUSTED_MARGIN_DIMENSIONS,
    })
  ).unsafeUnwrap();
  const printResult = await printer.printPdf(data);
  return { printResult, numberOfSections: reportSections.length };
}
