import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  BallotCountReport,
  Button,
  H6,
  Loading,
  Modal,
  printElement,
  printElementToPdf,
} from '@votingworks/ui';
import React, { useContext, useMemo, useState } from 'react';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import type { ScannerBatch } from '@votingworks/admin-backend';
import { LogEventId } from '@votingworks/logging';
import {
  getCardCounts,
  getCastVoteRecordFileMode,
  getScannerBatches,
} from '../../api';
import { AppContext } from '../../contexts/app_context';
import { PrintButton } from '../print_button';
import {
  generateBallotCountReportPdfFilename,
  generateTitleForReport,
} from '../../utils/reporting';
import { ExportReportPdfButton } from './export_report_pdf_button';
import { FileType } from '../save_frontend_file_modal';
import { ExportBallotCountReportCsvButton } from './export_ballot_count_report_csv_button';
import {
  ExportActions,
  GenerateButtonWrapper,
  PreviewContainer,
  PreviewLoading,
  PreviewReportPages,
  ReportWarning,
} from './shared';
import {
  BallotCountReportWarning,
  getBallotCountReportWarning,
  getBallotCountReportWarningText,
} from './ballot_count_report_warnings';

function Report({
  electionDefinition,
  scannerBatches,
  isOfficialResults,
  isTestMode,
  cardCountsList,
  filter,
  groupBy,
  includeSheetCounts,
  generatedAtTime,
}: {
  electionDefinition: ElectionDefinition;
  scannerBatches: ScannerBatch[];
  isOfficialResults: boolean;
  isTestMode: boolean;
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  filter: Admin.ReportingFilter;
  groupBy: Tabulation.GroupBy;
  includeSheetCounts: boolean;
  generatedAtTime: Date;
}): JSX.Element {
  const titleGeneration = generateTitleForReport({
    filter,
    electionDefinition,
    scannerBatches,
    reportType: 'Ballot Count',
  });
  const title = titleGeneration.isOk()
    ? titleGeneration.ok() ?? `Full Election Ballot Count Report`
    : 'Custom Filter Ballot Count Report';
  const customFilter = !titleGeneration.isOk() ? filter : undefined;

  return (
    <BallotCountReport
      title={title}
      isOfficial={isOfficialResults}
      isTest={isTestMode}
      testId="ballot-count-report"
      electionDefinition={electionDefinition}
      customFilter={customFilter}
      scannerBatches={scannerBatches}
      generatedAtTime={generatedAtTime}
      groupBy={groupBy}
      includeSheetCounts={includeSheetCounts}
      cardCountsList={cardCountsList}
    />
  );
}

export interface BallotCountReportViewerProps {
  filter: Admin.ReportingFilter;
  groupBy: Tabulation.GroupBy;
  includeSheetCounts: boolean;
  disabled: boolean;
  autoGenerateReport: boolean;
}

export function BallotCountReportViewer({
  filter,
  groupBy,
  includeSheetCounts,
  disabled: disabledFromProps,
  autoGenerateReport,
}: BallotCountReportViewerProps): JSX.Element {
  const { electionDefinition, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const [isFetchingForPreview, setIsFetchingForPreview] = useState(false);
  const [progressModalText, setProgressModalText] = useState<string>();

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const scannerBatchesQuery = getScannerBatches.useQuery();

  const disabled =
    disabledFromProps ||
    !castVoteRecordFileModeQuery.isSuccess ||
    !scannerBatchesQuery.isSuccess;

  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const cardCountsQuery = getCardCounts.useQuery(
    {
      filter,
      groupBy,
    },
    { enabled: !disabled && autoGenerateReport }
  );
  const reportQueryReady =
    cardCountsQuery.isSuccess && !cardCountsQuery.isStale;

  const printableReport: Optional<JSX.Element> = useMemo(() => {
    // If there's not current fresh data, return the previous preview report
    if (!reportQueryReady) {
      return undefined;
    }

    // If there's no data, don't render anything
    if (cardCountsQuery.data.length === 0) {
      return undefined;
    }

    return (
      <Report
        electionDefinition={assertDefined(electionDefinition)}
        filter={filter}
        groupBy={groupBy}
        includeSheetCounts={includeSheetCounts}
        cardCountsList={cardCountsQuery.data}
        generatedAtTime={new Date(cardCountsQuery.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        isTestMode={isTestMode}
        scannerBatches={scannerBatchesQuery.data ?? []}
      />
    );
  }, [
    reportQueryReady,
    cardCountsQuery.data,
    cardCountsQuery.dataUpdatedAt,
    electionDefinition,
    filter,
    groupBy,
    includeSheetCounts,
    isOfficialResults,
    isTestMode,
    scannerBatchesQuery.data,
  ]);

  async function generateReport() {
    setIsFetchingForPreview(true);
    await cardCountsQuery.refetch();
    setIsFetchingForPreview(false);
  }

  async function printReport() {
    assert(printableReport);
    setProgressModalText('Printing Report');
    const reportProperties = {
      filter: JSON.stringify(filter),
      groupBy: JSON.stringify(groupBy),
    } as const;
    try {
      await printElement(printableReport, { sides: 'one-sided' });
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User printed a ballot count report.`,
        disposition: 'success',
        ...reportProperties,
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User attempted to print a ballot count report, but an error occurred: ${error.message}`,
        disposition: 'failure',
        ...reportProperties,
      });
    } finally {
      setProgressModalText(undefined);
    }
  }

  async function generateReportPdf(): Promise<Uint8Array> {
    assert(printableReport);
    return printElementToPdf(printableReport);
  }

  const ballotCountReportWarning: BallotCountReportWarning = reportQueryReady
    ? getBallotCountReportWarning({
        allCardCounts: cardCountsQuery.data,
      })
    : { type: 'none' };
  const reportIsEmpty =
    ballotCountReportWarning.type === 'no-reports-match-filter';

  const reportPdfFilename = generateBallotCountReportPdfFilename({
    election,
    filter,
    groupBy,
    isTestMode: castVoteRecordFileModeQuery.data === 'test',
    isOfficialResults,
    time: cardCountsQuery.dataUpdatedAt
      ? new Date(cardCountsQuery.dataUpdatedAt)
      : undefined,
  });

  const disableActionButtons = disabled || !reportQueryReady || reportIsEmpty;

  return (
    <React.Fragment>
      <ExportActions>
        <PrintButton
          print={printReport}
          variant="primary"
          disabled={disableActionButtons}
          useDefaultProgressModal={false}
        >
          Print Report
        </PrintButton>
        <ExportReportPdfButton
          electionDefinition={electionDefinition}
          generateReportPdf={generateReportPdf}
          defaultFilename={reportPdfFilename}
          disabled={disableActionButtons}
          fileType={FileType.BallotCountReport}
        />
        <ExportBallotCountReportCsvButton
          filter={filter}
          groupBy={groupBy}
          includeSheetCounts={includeSheetCounts}
          disabled={disableActionButtons}
        />
        {!autoGenerateReport && (
          <GenerateButtonWrapper>
            <Button
              variant="primary"
              disabled={disabled || reportQueryReady}
              onPress={generateReport}
            >
              Generate Report
            </Button>
          </GenerateButtonWrapper>
        )}
      </ExportActions>
      <ReportWarning
        text={getBallotCountReportWarningText({
          ballotCountReportWarning,
        })}
      />
      <PreviewContainer>
        {!disabled && (
          <React.Fragment>
            {printableReport ? (
              <PreviewReportPages>{printableReport}</PreviewReportPages>
            ) : (
              isFetchingForPreview && <PreviewLoading />
            )}
          </React.Fragment>
        )}
      </PreviewContainer>
      {progressModalText && (
        <Modal
          centerContent
          content={
            <H6>
              <Loading>{progressModalText}</Loading>
            </H6>
          }
        />
      )}
    </React.Fragment>
  );
}
