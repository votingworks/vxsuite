import {
  Admin,
  Contest,
  ElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import { getScannedBallotCount } from '@votingworks/utils';
import { ThemeProvider } from 'styled-components';
import {
  printedReportThemeFn,
  PrintedReport,
  TallyReportColumns,
} from './layout';
import { LogoMark } from '../logo_mark';
import { ContestResultsTable } from './contest_results_table';
import { TallyReportCardCounts } from './tally_report_card_counts';
import { CustomFilterSummary } from './custom_filter_summary';
import { LabeledScannerBatch, prefixedTitle } from './utils';
import { CertificationSignatures } from './certification_signatures';
import {
  ReportHeader,
  ReportTitle,
  ReportElectionInfo,
  TestModeReportBanner,
  ManualResultsReportBanner,
  ReportSubtitle,
} from './report_header';
import { ReportGeneratedMetadata } from './report_generated_metadata';

export interface AdminTallyReportProps {
  title: string;
  isOfficial: boolean;
  isTest: boolean;
  isForLogicAndAccuracyTesting?: boolean;
  testId?: string;
  electionDefinition: ElectionDefinition;
  electionPackageHash?: string;
  partyLabel?: string;
  contests: readonly Contest[];
  scannedElectionResults: Tabulation.ElectionResults;
  manualElectionResults?: Tabulation.ManualElectionResults;
  cardCountsOverride?: Tabulation.CardCounts;
  generatedAtTime?: Date;
  customFilter?: Admin.FrontendReportingFilter;
  scannerBatches?: LabeledScannerBatch[]; // Only needed when customFilter is present
  includeSignatureLines?: boolean;
  aggregateInsignificantWriteIns?: boolean;
}

export function AdminTallyReport({
  title,
  isOfficial,
  isTest,
  isForLogicAndAccuracyTesting,
  testId,
  electionDefinition,
  electionPackageHash,
  partyLabel,
  contests,
  scannedElectionResults,
  manualElectionResults,
  cardCountsOverride,
  generatedAtTime = new Date(),
  customFilter,
  scannerBatches,
  includeSignatureLines,
  aggregateInsignificantWriteIns,
}: AdminTallyReportProps): JSX.Element {
  const { election } = electionDefinition;
  const cardCounts = cardCountsOverride ?? {
    ...scannedElectionResults.cardCounts,
    manual: manualElectionResults?.ballotCount,
  };
  const scannedBallotCount = getScannedBallotCount(cardCounts);
  const manualBallotCount = cardCounts.manual ?? 0;
  const separateManualResults = scannedBallotCount > 0 && manualBallotCount > 0;
  const isManualOnly = scannedBallotCount === 0 && manualBallotCount > 0;
  const reportTitle = prefixedTitle({
    isOfficial,
    isForLogicAndAccuracyTesting,
    title,
  });

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid={testId}>
        {isTest && <TestModeReportBanner />}
        {isManualOnly && <ManualResultsReportBanner />}
        <LogoMark />
        <ReportHeader>
          <ReportTitle>{reportTitle}</ReportTitle>
          {partyLabel && <ReportSubtitle>{partyLabel}</ReportSubtitle>}
          {customFilter && (
            <CustomFilterSummary
              electionDefinition={electionDefinition}
              scannerBatches={assertDefined(scannerBatches)}
              filter={customFilter}
            />
          )}
          <ReportElectionInfo election={election} />
          <ReportGeneratedMetadata
            generatedAtTime={generatedAtTime}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
          />
          {includeSignatureLines && <CertificationSignatures />}
        </ReportHeader>
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
                contestResults={
                  isManualOnly
                    ? manualContestResults ?? scannedContestResults
                    : scannedContestResults
                }
                separateManualContestResults={
                  separateManualResults ? manualContestResults : undefined
                }
                aggregateInsignificantWriteIns={aggregateInsignificantWriteIns}
              />
            );
          })}
        </TallyReportColumns>
      </PrintedReport>
    </ThemeProvider>
  );
}
