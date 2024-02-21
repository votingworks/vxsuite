import {
  Admin,
  Contests,
  ElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ThemeProvider } from 'styled-components';
import {
  printedReportThemeFn,
  PrintedReport,
  TallyReportColumns,
} from './layout';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestResultsTable } from './contest_results_table';
import { TallyReportCardCounts } from './tally_report_card_counts';
import { CustomFilterSummary } from './custom_filter_summary';
import { prefixedTitle } from './utils';
import { CertificationSignatures } from './certification_signatures';

export interface AdminTallyReportProps {
  title: string;
  subtitle?: string;
  isOfficial: boolean;
  isTest: boolean;
  isForLogicAndAccuracyTesting?: boolean;
  testId?: string;
  electionDefinition: ElectionDefinition;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  manualElectionResults?: Tabulation.ManualElectionResults;
  cardCountsOverride?: Tabulation.CardCounts;
  generatedAtTime?: Date;
  customFilter?: Admin.FrontendReportingFilter;
  includeSignatureLines?: boolean;
}

export function AdminTallyReport({
  title,
  subtitle,
  isOfficial,
  isTest,
  isForLogicAndAccuracyTesting,
  testId,
  electionDefinition,
  contests,
  scannedElectionResults,
  manualElectionResults,
  cardCountsOverride,
  generatedAtTime = new Date(),
  customFilter,
  includeSignatureLines,
}: AdminTallyReportProps): JSX.Element {
  const { election } = electionDefinition;
  const cardCounts = cardCountsOverride ?? {
    ...scannedElectionResults.cardCounts,
    manual: manualElectionResults?.ballotCount,
  };

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid={testId}>
        <LogoMark />
        <h1>
          {prefixedTitle({
            isOfficial,
            isTest,
            isForLogicAndAccuracyTesting,
            title,
          })}
        </h1>
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
        {includeSignatureLines && <CertificationSignatures />}
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
      </PrintedReport>
    </ThemeProvider>
  );
}
