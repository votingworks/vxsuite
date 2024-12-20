import {
  Contests,
  ElectionDefinition,
  PartyId,
  PrecinctSelection,
  StandardPollsTransitionType,
  Tabulation,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ThemeProvider } from 'styled-components';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import {
  PrintedReport,
  TallyReportColumns,
  printedReportThemeFn,
} from './layout';
import { TallyReportCardCounts } from './tally_report_card_counts';
import { ContestResultsTable } from './contest_results_table';

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  pollsTransition: StandardPollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
}

/**
 * A single tally report representing a single precinct selection and party
 * selection, which could be "All Precincts" and "No Party" respectively.
 */
export function PrecinctScannerTallyReport({
  electionDefinition,
  electionPackageHash,
  partyId,
  precinctSelection,
  contests,
  scannedElectionResults,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  reportPrintedTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined;

  const { cardCounts } = scannedElectionResults;

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid={`tally-report-${partyId}-${precinctId}`}>
        <PrecinctScannerReportHeader
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
          partyId={partyId}
          precinctSelection={precinctSelection}
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={pollsTransitionedTime}
          reportPrintedTime={reportPrintedTime}
          precinctScannerMachineId={precinctScannerMachineId}
        />
        <TallyReportColumns>
          <TallyReportCardCounts cardCounts={cardCounts} />
          {contests.map((contest) => {
            const scannedContestResults =
              scannedElectionResults.contestResults[contest.id];
            assert(
              scannedContestResults,
              `missing scanned results for contest ${contest.id}`
            );
            return (
              <ContestResultsTable
                key={contest.id}
                election={election}
                contest={contest}
                scannedContestResults={scannedContestResults}
              />
            );
          })}
        </TallyReportColumns>
      </PrintedReport>
    </ThemeProvider>
  );
}
