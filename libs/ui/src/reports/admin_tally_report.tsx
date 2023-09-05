import { Contests, ElectionDefinition, Tabulation } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ThemeProvider } from 'styled-components';
import {
  ReportSection,
  tallyReportThemeFn,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestResultsTable } from './contest_results_table';
import { TallyReportCardCounts } from './tally_report_card_counts';
import { CustomFilterSummary } from './custom_filter_summary';

export interface AdminTallyReportProps {
  title: string;
  subtitle?: string;
  testId?: string;
  electionDefinition: ElectionDefinition;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  manualElectionResults?: Tabulation.ManualElectionResults;
  cardCountsOverride?: Tabulation.CardCounts;
  generatedAtTime?: Date;
  customFilter?: Tabulation.Filter;
}

export function AdminTallyReport({
  title,
  subtitle,
  testId,
  electionDefinition,
  contests,
  scannedElectionResults,
  manualElectionResults,
  cardCountsOverride,
  generatedAtTime = new Date(),
  customFilter,
}: AdminTallyReportProps): JSX.Element {
  const { election } = electionDefinition;
  const cardCounts = cardCountsOverride ?? {
    ...scannedElectionResults.cardCounts,
    manual: manualElectionResults?.ballotCount,
  };

  return (
    <ThemeProvider theme={tallyReportThemeFn}>
      <TallyReport data-testid={testId}>
        <ReportSection>
          <LogoMark />
          <h1>{title}</h1>

          {subtitle && <h2>{subtitle}</h2>}
          {customFilter && (
            <CustomFilterSummary
              electionDefinition={electionDefinition}
              filter={customFilter}
            />
          )}
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
