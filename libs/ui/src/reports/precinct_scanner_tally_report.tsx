import {
  BatchInfo,
  Contest,
  ElectionDefinition,
  PartyId,
  StandardPollsTransitionType,
  Tabulation,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ThemeProvider } from 'styled-components';
import { BatchSummaryTable } from './batch_summary_table';
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
  pollingPlaceId?: string;
  contests: readonly Contest[];
  scannedElectionResults: Tabulation.ElectionResults;
  pollsTransition: StandardPollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
  batches: BatchInfo[];
}

/**
 * A single tally report representing a single precinct selection and party
 * selection, which could be "All Precincts" and "No Party" respectively.
 */
export function PrecinctScannerTallyReport({
  electionDefinition,
  electionPackageHash,
  partyId,
  pollingPlaceId,
  contests,
  scannedElectionResults,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  reportPrintedTime,
  precinctScannerMachineId,
  batches,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const { cardCounts } = scannedElectionResults;
  const singleBatchId = batches.length === 1 ? batches[0].id : undefined;

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport>
        <PrecinctScannerReportHeader
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
          partyId={partyId}
          pollingPlaceId={pollingPlaceId}
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={pollsTransitionedTime}
          reportPrintedTime={reportPrintedTime}
          precinctScannerMachineId={precinctScannerMachineId}
          batchId={singleBatchId}
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
        {batches.length > 1 && <BatchSummaryTable batches={batches} />}
      </PrintedReport>
    </ThemeProvider>
  );
}
