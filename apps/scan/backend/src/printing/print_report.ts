import { assert, assertDefined } from '@votingworks/basics';
import {
  combineElectionResults,
  getEmptyElectionResults,
  groupContestsByParty,
  isPollsSuspensionTransition,
  type PartyWithContests,
} from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReport,
} from '@votingworks/ui';
import {
  concatenatePdfs,
  PAPER_DIMENSIONS,
  renderToPdf,
} from '@votingworks/printing';
import type {
  FujitsuThermalPrinterInterface,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import {
  type Election,
  pollingPlaceContests,
  pollingPlaceFromElection,
  type PollsSuspensionTransitionType,
  type StandardPollsTransitionType,
} from '@votingworks/types';
import type { Store } from '../store.js';
import { getMachineConfig } from '../machine_config.js';
import { getScannerResultsMemoized } from '../util/results.js';
import { getCurrentTime } from '../util/get_current_time.js';
import { rootDebug } from '../util/debug.js';
import { ADJUSTED_MARGIN_DIMENSIONS } from './constants.js';

const debug = rootDebug.extend('print-report');

/**
 * A single section of a polls report. A polls paused/resumed report is a
 * single ballot count section; a tally report (open/close) has one section per
 * party (plus a nonpartisan section). {@link printReport} prints every section
 * back-to-back as one continuous print.
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
  reportSection: ReportSection,
  reportPrintedTime: number
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

  if (reportSection.type === 'ballotCount') {
    debug(
      `polls transition is ${pollsTransition.type}, generating ballot count report`
    );
    // @coverage-exclude: there should be at least one completed batch but keep the fallback
    const mostRecentBatchCount =
      reportSection.pollsTransitionType === 'pause_voting'
        ? ([...allBatches]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .find((b) => b.endedAt !== undefined)?.count ?? 0)
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
      reportPrintedTime,
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
    reportPrintedTime,
    precinctScannerMachineId: machineId,
    scannedElectionResults,
    batches: tallyReportBatches,
  });
}

function contestsForPollingPlace(election: Election, placeId?: string) {
  const place = pollingPlaceFromElection(election, assertDefined(placeId));
  return pollingPlaceContests(election, place);
}

export async function printReport({
  store,
  printer,
}: {
  store: Store;
  printer: FujitsuThermalPrinterInterface;
}): Promise<PrintResult> {
  const reportPrintedTime = getCurrentTime();
  const sectionPdfs = (
    await renderToPdf(
      await Promise.all(
        getReportSections(store).map(async (reportSection) => ({
          document: await getReportSection(
            store,
            reportSection,
            reportPrintedTime
          ),
          paperDimensions: PAPER_DIMENSIONS.LetterRoll,
          marginDimensions: ADJUSTED_MARGIN_DIMENSIONS,
        }))
      )
    )
  ).unsafeUnwrap();
  const data = (await concatenatePdfs(sectionPdfs)).unsafeUnwrap();
  return printer.printPdf(data);
}
