import { Contests, Election, Tabulation } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ThemeProvider } from 'styled-components';
import {
  ReportSection,
  TALLY_REPORT_THEME,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestResultsTable } from './contest_results_table';
import { TallyReportCardCounts } from './tally_report_card_counts';

export interface AdminTallyReportProps {
  title: string;
  subtitle?: string;
  testId?: string;
  election: Election;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  manualElectionResults?: Tabulation.ManualElectionResults;
  generatedAtTime?: Date;
}

export function AdminTallyReport({
  title,
  subtitle,
  testId,
  election,
  contests,
  scannedElectionResults,
  manualElectionResults,
  generatedAtTime = new Date(),
}: AdminTallyReportProps): JSX.Element {
  const cardCounts = manualElectionResults
    ? {
        ...scannedElectionResults.cardCounts,
        manual: manualElectionResults.ballotCount,
      }
    : scannedElectionResults.cardCounts;

  return (
    <ThemeProvider theme={TALLY_REPORT_THEME}>
      <TallyReport data-testid={testId}>
        <ReportSection>
          <LogoMark />
          <h1>{title}</h1>
          {subtitle && <h2>{subtitle}</h2>}
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
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
              const manualContestResults =
                manualElectionResults?.contestResults[contest.id];
              return (
                <ContestResultsTable
                  key={contest.id}
                  election={election}
                  contest={contest}
                  scannedContestResults={scannedContestResults}
                  manualContestResults={manualContestResults}
                />
              );
            })}
          </TallyReportColumns>
        </ReportSection>
      </TallyReport>
    </ThemeProvider>
  );
}
