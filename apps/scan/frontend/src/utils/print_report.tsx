import type { MachineConfig, PollsTransition } from '@votingworks/scan-backend';
import {
  ElectionDefinition,
  PrecinctSelection,
  Tabulation,
} from '@votingworks/types';
import {
  combineElectionResults,
  compressTally,
  isPollsSuspensionTransition,
} from '@votingworks/utils';
import {
  PrecinctScannerBallotCountReport,
  PrecinctScannerTallyReports,
  getSignedQuickResultsReportingUrl,
  printElement,
} from '@votingworks/ui';
import { rootDebug } from './debug';
import { getPageCount } from './get_page_count';

const debug = rootDebug.extend('print-report');

interface PrintReportProps {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  machineConfig: MachineConfig;
  isLiveMode: boolean;
  pollsTransitionInfo: PollsTransition;
  scannerResultsByParty: Tabulation.GroupList<Tabulation.ElectionResults>;
  copies: number;
  numPagesCallback: (numPages: number) => void;
}

export async function printReport({
  electionDefinition,
  precinctSelection,
  machineConfig,
  isLiveMode,
  scannerResultsByParty,
  pollsTransitionInfo,
  copies,
  numPagesCallback,
}: PrintReportProps): Promise<void> {
  const { election } = electionDefinition;
  const {
    type: pollsTransition,
    time: pollsTransitionTime,
    ballotCount,
  } = pollsTransitionInfo;
  const combinedScannerResults = combineElectionResults({
    election,
    allElectionResults: scannerResultsByParty,
  });

  const report = await (async () => {
    if (isPollsSuspensionTransition(pollsTransition)) {
      debug('printing ballot count report...');
      return (
        <PrecinctScannerBallotCountReport
          electionDefinition={electionDefinition}
          precinctSelection={precinctSelection}
          totalBallotsScanned={ballotCount}
          pollsTransition={pollsTransition}
          pollsTransitionedTime={pollsTransitionTime}
          isLiveMode={isLiveMode}
          precinctScannerMachineId={machineConfig.machineId}
        />
      );
    }

    debug('printing tally report...');

    const signedQuickResultsReportingUrl =
      await getSignedQuickResultsReportingUrl({
        electionDefinition,
        isLiveMode,
        compressedTally: compressTally(
          electionDefinition.election,
          combinedScannerResults
        ),
        signingMachineId: machineConfig.machineId,
      });

    return (
      <PrecinctScannerTallyReports
        electionDefinition={electionDefinition}
        precinctSelection={precinctSelection}
        electionResultsByParty={scannerResultsByParty}
        pollsTransition={pollsTransition}
        isLiveMode={isLiveMode}
        pollsTransitionedTime={pollsTransitionTime}
        precinctScannerMachineId={machineConfig.machineId}
        totalBallotsScanned={ballotCount}
        signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
      />
    );
  })();

  await printElement(report, {
    sides: 'one-sided',
    copies,
  });

  numPagesCallback(await getPageCount(report));
}
