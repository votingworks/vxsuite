import {
  Contests,
  ElectionDefinition,
  PartyId,
  PrecinctSelection,
  StandardPollsTransitionType,
  Tabulation,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import { ReportSection, TallyReport, TallyReportColumns } from './tally_report';
import { TallyReportCardCounts } from './tally_report_card_counts';
import { ContestResultsTable } from './contest_results_table';

interface Props {
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  pollsTransition: StandardPollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
}

/**
 * A single tally report representing a single precinct selection and party
 * selection, which could be "All Precincts" and "No Party" respectively.
 */
export function PrecinctScannerTallyReport({
  electionDefinition,
  partyId,
  precinctSelection,
  contests,
  scannedElectionResults,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  currentTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined;

  const { cardCounts } = scannedElectionResults;

  return (
    <TallyReport data-testid={`tally-report-${partyId}-${precinctId}`}>
      <ReportSection>
        <PrecinctScannerReportHeader
          electionDefinition={electionDefinition}
          partyId={partyId}
          precinctSelection={precinctSelection}
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={pollsTransitionedTime}
          currentTime={currentTime}
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
      </ReportSection>
    </TallyReport>
  );
}
