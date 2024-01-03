import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  AdminTallyReportByParty,
  Button,
  H6,
  Loading,
  Modal,
  printElement,
  printElementToPdf,
} from '@votingworks/ui';
import React, { useContext, useMemo, useState } from 'react';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  isElectionManagerAuth,
  isFilterEmpty,
  isGroupByEmpty,
} from '@votingworks/utils';
import type { ScannerBatch } from '@votingworks/admin-backend';
import { LogEventId } from '@votingworks/logging';
import {
  getCastVoteRecordFileMode,
  getResultsForTallyReports,
  getScannerBatches,
} from '../../api';
import { AppContext } from '../../contexts/app_context';
import { PrintButton } from '../print_button';
import {
  generateTallyReportPdfFilename,
  generateTitleForReport,
} from '../../utils/reporting';
import { ExportReportPdfButton } from './export_report_pdf_button';
import { ExportTallyReportCsvButton } from './export_tally_report_csv_button';
import { FileType } from '../save_frontend_file_modal';
import {
  ExportActions,
  GenerateButtonWrapper,
  PreviewContainer,
  PreviewLoading,
  PreviewReportPages,
  ReportWarning,
} from './shared';
import {
  TallyReportWarning,
  getTallyReportWarning,
  getTallyReportWarningText,
} from './tally_report_warnings';
import { ExportCdfElectionResultsReportButton } from './export_cdf_election_results_report_button';

function Reports({
  electionDefinition,
  isOfficialResults,
  isTestMode,
  allTallyReportResults,
  filterUsed,
  generatedAtTime,
  scannerBatches,
  includeSignatureLines,
}: {
  electionDefinition: ElectionDefinition;
  isOfficialResults: boolean;
  isTestMode: boolean;
  allTallyReportResults: Tabulation.GroupList<Admin.TallyReportResults>;
  filterUsed: Admin.FrontendReportingFilter;
  generatedAtTime: Date;
  scannerBatches: ScannerBatch[];
  includeSignatureLines?: boolean;
}): JSX.Element {
  const allReports: JSX.Element[] = [];

  for (const [index, tallyReportResults] of allTallyReportResults.entries()) {
    const sectionFilter = combineGroupSpecifierAndFilter(
      tallyReportResults,
      filterUsed
    );
    const titleGeneration = generateTitleForReport({
      filter: sectionFilter,
      electionDefinition,
      scannerBatches,
    });
    const title = titleGeneration.isOk()
      ? titleGeneration.ok()
      : 'Custom Filter Tally Report';
    const displayedFilter = !titleGeneration.isOk() ? sectionFilter : undefined;

    allReports.push(
      <AdminTallyReportByParty
        electionDefinition={electionDefinition}
        testId="tally-report"
        key={`tally-report-${index}`}
        title={title}
        tallyReportResults={tallyReportResults}
        isOfficial={isOfficialResults}
        isTest={isTestMode}
        generatedAtTime={generatedAtTime}
        customFilter={displayedFilter}
        includeSignatureLines={includeSignatureLines}
      />
    );
  }

  return <React.Fragment>{allReports}</React.Fragment>;
}

export interface TallyReportViewerProps {
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  disabled: boolean;
  autoGenerateReport: boolean;
}

export function TallyReportViewer({
  filter,
  groupBy,
  disabled: disabledFromProps,
  autoGenerateReport,
}: TallyReportViewerProps): JSX.Element {
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
  const isFullElectionReport = isFilterEmpty(filter) && isGroupByEmpty(groupBy);

  const reportResultsQuery = getResultsForTallyReports.useQuery(
    {
      filter,
      groupBy,
    },
    { enabled: !disabled && autoGenerateReport }
  );
  const reportQueryReady =
    reportResultsQuery.isSuccess && !reportResultsQuery.isStale;

  const printableReport: Optional<JSX.Element> = useMemo(() => {
    if (!reportQueryReady) {
      return undefined;
    }

    if (reportResultsQuery.data.length === 0) {
      return undefined;
    }

    return (
      <Reports
        electionDefinition={assertDefined(electionDefinition)}
        filterUsed={filter}
        allTallyReportResults={reportResultsQuery.data}
        generatedAtTime={new Date(reportResultsQuery.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        isTestMode={isTestMode}
        scannerBatches={scannerBatchesQuery.data ?? []}
        includeSignatureLines={isFullElectionReport}
      />
    );
  }, [
    reportQueryReady,
    reportResultsQuery.data,
    reportResultsQuery.dataUpdatedAt,
    electionDefinition,
    filter,
    isOfficialResults,
    isTestMode,
    scannerBatchesQuery.data,
    isFullElectionReport,
  ]);

  async function generateReport() {
    setIsFetchingForPreview(true);
    await reportResultsQuery.refetch();
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
        message: `User printed a tally report.`,
        disposition: 'success',
        ...reportProperties,
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User attempted to print a tally report, but an error occurred: ${error.message}`,
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

  const tallyReportWarning: TallyReportWarning = reportQueryReady
    ? getTallyReportWarning({
        election,
        allTallyReports: reportResultsQuery.data,
      })
    : { type: 'none' };
  const reportIsEmpty = tallyReportWarning.type === 'no-reports-match-filter';

  const reportPdfFilename = generateTallyReportPdfFilename({
    election,
    filter,
    groupBy,
    isTestMode: castVoteRecordFileModeQuery.data === 'test',
    isOfficialResults,
    time: reportResultsQuery.dataUpdatedAt
      ? new Date(reportResultsQuery.dataUpdatedAt)
      : undefined,
  });

  const disableActionButtons = disabled || !reportQueryReady || reportIsEmpty;

  return (
    <React.Fragment>
      <ExportActions>
        <PrintButton
          print={printReport}
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
          fileType={FileType.TallyReport}
        />
        <ExportTallyReportCsvButton
          filter={filter}
          groupBy={groupBy}
          disabled={disableActionButtons}
        />
        {isFullElectionReport && (
          <ExportCdfElectionResultsReportButton
            disabled={disableActionButtons}
          />
        )}
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
        text={getTallyReportWarningText({ tallyReportWarning, election })}
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
