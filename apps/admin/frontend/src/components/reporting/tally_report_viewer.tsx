import { ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  Button,
  H6,
  Loading,
  Modal,
  printElement,
  printElementToPdf,
} from '@votingworks/ui';
import React, { useContext, useMemo, useRef, useState } from 'react';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import {
  combineGroupSpecifierAndFilter,
  isElectionManagerAuth,
} from '@votingworks/utils';
import type {
  ScannerBatch,
  TallyReportResults,
} from '@votingworks/admin-backend';
import { LogEventId } from '@votingworks/logging';
import {
  getCastVoteRecordFileMode,
  getResultsForTallyReports,
  getScannerBatches,
} from '../../api';
import { AppContext } from '../../contexts/app_context';
import { AdminTallyReportByParty } from '../admin_tally_report_by_party';
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
  NoResultsNotice,
  PaginationNote,
  PreviewActionContainer,
  PreviewContainer,
  PreviewLoading,
  PreviewOverlay,
  PreviewReportPages,
} from './shared';

function Reports({
  electionDefinition,
  isOfficialResults,
  isTestMode,
  allTallyReportResults,
  filterUsed,
  generatedAtTime,
  scannerBatches,
}: {
  electionDefinition: ElectionDefinition;
  isOfficialResults: boolean;
  isTestMode: boolean;
  allTallyReportResults: Tabulation.GroupList<TallyReportResults>;
  filterUsed: Tabulation.Filter;
  generatedAtTime: Date;
  scannerBatches: ScannerBatch[];
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
      />
    );
  }

  return <React.Fragment>{allReports}</React.Fragment>;
}

export interface TallyReportViewerProps {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  disabled: boolean;
  autoPreview: boolean;
}

export function TallyReportViewer({
  filter,
  groupBy,
  disabled: disabledFromProps,
  autoPreview,
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

  const reportResultsQuery = getResultsForTallyReports.useQuery(
    {
      filter,
      groupBy,
    },
    { enabled: !disabled && autoPreview }
  );
  const reportResultsAreFresh =
    reportResultsQuery.isSuccess && !reportResultsQuery.isStale;

  const previewReportRef = useRef<Optional<JSX.Element>>();
  const previewReport: Optional<JSX.Element> = useMemo(() => {
    // Avoid populating the preview with cached data before the caller signals that the parameters are viable
    if (disabled) {
      return undefined;
    }

    // If there's not current fresh data, return the previous preview report
    if (!reportResultsAreFresh) {
      return previewReportRef.current;
    }

    // If there's no data, don't render anything
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
      />
    );
  }, [
    disabled,
    reportResultsAreFresh,
    reportResultsQuery.data,
    reportResultsQuery.dataUpdatedAt,
    electionDefinition,
    filter,
    isOfficialResults,
    isTestMode,
    scannerBatchesQuery.data,
  ]);
  previewReportRef.current = previewReport;
  const previewIsFresh =
    reportResultsQuery.isSuccess && !reportResultsQuery.isStale;
  const areQueryResultsEmpty =
    reportResultsQuery.isSuccess && reportResultsQuery.data.length === 0;

  async function refreshPreview() {
    setIsFetchingForPreview(true);
    await reportResultsQuery.refetch();
    setIsFetchingForPreview(false);
  }

  async function getFreshQueryResult(): Promise<typeof reportResultsQuery> {
    if (reportResultsAreFresh) {
      return reportResultsQuery;
    }

    return reportResultsQuery.refetch({ cancelRefetch: false });
  }

  async function printReport() {
    setProgressModalText('Generating Report');
    const queryResults = await getFreshQueryResult();
    assert(queryResults.isSuccess);
    const reportToPrint = (
      <Reports
        electionDefinition={assertDefined(electionDefinition)}
        filterUsed={filter}
        allTallyReportResults={queryResults.data}
        generatedAtTime={new Date(queryResults.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        isTestMode={isTestMode}
        scannerBatches={scannerBatchesQuery.data ?? []}
      />
    );

    setProgressModalText('Printing Report');
    const reportProperties = {
      filter: JSON.stringify(filter),
      groupBy: JSON.stringify(groupBy),
    } as const;
    try {
      await printElement(reportToPrint, { sides: 'one-sided' });
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
    const queryResults = await getFreshQueryResult();
    assert(queryResults.isSuccess);
    const reportToSave = (
      <Reports
        electionDefinition={assertDefined(electionDefinition)}
        filterUsed={filter}
        allTallyReportResults={queryResults.data}
        generatedAtTime={new Date(queryResults.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        isTestMode={isTestMode}
        scannerBatches={scannerBatchesQuery.data ?? []}
      />
    );

    return printElementToPdf(reportToSave);
  }

  const reportPdfFilename = generateTallyReportPdfFilename({
    election,
    filter,
    groupBy,
    isTestMode: castVoteRecordFileModeQuery.data === 'test',
    time: reportResultsQuery.dataUpdatedAt
      ? new Date(reportResultsQuery.dataUpdatedAt)
      : undefined,
  });

  return (
    <React.Fragment>
      <ExportActions>
        <PrintButton
          print={printReport}
          variant="primary"
          disabled={disabled || areQueryResultsEmpty}
          useDefaultProgressModal={false}
        >
          Print Report
        </PrintButton>
        <ExportReportPdfButton
          electionDefinition={electionDefinition}
          generateReportPdf={generateReportPdf}
          defaultFilename={reportPdfFilename}
          disabled={disabled || areQueryResultsEmpty}
          fileType={FileType.TallyReport}
        />
        <ExportTallyReportCsvButton
          filter={filter}
          groupBy={groupBy}
          disabled={disabled || areQueryResultsEmpty}
        />
      </ExportActions>
      <PaginationNote />
      <PreviewContainer>
        {!disabled && (
          <React.Fragment>
            {previewReport && (
              <PreviewReportPages>{previewReport}</PreviewReportPages>
            )}
            {areQueryResultsEmpty && (
              <NoResultsNotice>
                No results found given the current report parameters.
              </NoResultsNotice>
            )}
            {!previewIsFresh && <PreviewOverlay />}
            {isFetchingForPreview && <PreviewLoading />}
            {!isFetchingForPreview && !previewIsFresh && (
              <PreviewActionContainer>
                {previewReport ? (
                  <Button icon="RotateRight" onPress={refreshPreview}>
                    Refresh Preview
                  </Button>
                ) : (
                  <Button onPress={refreshPreview}>Load Preview</Button>
                )}
              </PreviewActionContainer>
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
