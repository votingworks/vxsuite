import { assert, assertDefined } from '@votingworks/basics';
import {
  combineElectionResults,
  getContestsForPrecinct,
  getEmptyElectionResults,
  isPollsSuspensionTransition,
} from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReport,
} from '@votingworks/ui';
import {
  DEFAULT_MARGIN_DIMENSIONS,
  MarginDimensions,
  PAPER_DIMENSIONS,
  renderToPdf,
} from '@votingworks/printing';
import {
  FujitsuThermalPrinterInterface,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import { generateSignedQuickResultsReportingUrl } from '@votingworks/auth';
import {
  Contests,
  Election,
  getPartyIdsWithContests,
  PartyId,
} from '@votingworks/types';
import { Store } from '../store';
import { getMachineConfig } from '../machine_config';
import { getScannerResultsMemoized } from '../util/results';
import { getCurrentTime } from '../util/get_current_time';
import { rootDebug } from '../util/debug';

const debug = rootDebug.extend('print-report-section');

interface TallyReportSectionSpec {
  partyId?: PartyId;
  contests: Contests;
}

function getTallyReportSectionSpecs(
  election: Election,
  contests: Contests
): TallyReportSectionSpec[] {
  const partyIds = getPartyIdsWithContests(election);
  return partyIds.map((partyId) => {
    const sectionContests = partyId
      ? contests.filter((c) => c.type === 'candidate' && c.partyId === partyId)
      : contests.filter((c) => c.type === 'yesno' || !c.partyId);
    return { partyId, contests: sectionContests };
  });
}

async function getReportSection(
  store: Store,
  reportSectionIndex: number
): Promise<JSX.Element> {
  const { electionDefinition, electionPackageHash } = assertDefined(
    store.getElectionRecord()
  );
  const { election } = electionDefinition;
  const systemSettings = assertDefined(store.getSystemSettings());
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

  const signedQuickResultsReportingUrl =
    (pollsTransition.type === 'close_polls' &&
      systemSettings.quickResultsReportingUrl &&
      (await generateSignedQuickResultsReportingUrl({
        electionDefinition,
        quickResultsReportingUrl: systemSettings.quickResultsReportingUrl,
        signingMachineId: machineId,
        isLiveMode,
        results: scannerResultsCombined,
      }))) ||
    undefined;

  const fullReportContests = getContestsForPrecinct(
    electionDefinition,
    precinctSelection
  );

  const { partyId, contests: reportSectionContests } =
    getTallyReportSectionSpecs(election, fullReportContests)[
      reportSectionIndex
    ];

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
    signedQuickResultsReportingUrl,
  });
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
