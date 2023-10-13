import { ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  BallotCountReport,
  Button,
  Caption,
  Font,
  H5,
  H6,
  Icons,
  Loading,
  Modal,
  printElement,
  printElementToPdf,
} from '@votingworks/ui';
import React, { useContext, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
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

const ExportActions = styled.div`
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: start;
  gap: 1rem;
`;

const PreviewContainer = styled.div`
  position: relative;
  min-height: 11in;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 10%);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const PreviewOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: black;
  opacity: 0.3;
`;

const PreviewReportPages = styled.div`
  section {
    background: white;
    position: relative;
    box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
    margin-top: 1rem;
    margin-bottom: 2rem;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

const PreviewActionContainer = styled.div`
  position: absolute;
  inset: 0;
  margin-left: auto;
  margin-right: auto;
  margin-top: 4rem;
  display: flex;
  justify-content: center;
  align-items: start;
  z-index: 2;
`;

const LoadingTextContainer = styled.div`
  background: white;
  width: 35rem;
  border-radius: 0.5rem;
`;

const NoResultsNotice = styled(H5)`
  margin-top: 2rem;
`;

function Report({
  electionDefinition,
  scannerBatches,
  isOfficialResults,
  cardCountsList,
  filter,
  groupBy,
  generatedAtTime,
}: {
  electionDefinition: ElectionDefinition;
  scannerBatches: ScannerBatch[];
  isOfficialResults: boolean;
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  generatedAtTime: Date;
}): JSX.Element {
  const titleGeneration = generateTitleForReport({
    filter,
    electionDefinition,
    scannerBatches,
    reportType: 'Ballot Count',
  });
  const titleWithoutOfficiality = titleGeneration.isOk()
    ? titleGeneration.ok() ?? `Full Election Ballot Count Report`
    : 'Custom Filter Ballot Count Report';
  const title = `${
    isOfficialResults ? 'Official ' : 'Unofficial '
  }${titleWithoutOfficiality}`;
  const customFilter = !titleGeneration.isOk() ? filter : undefined;

  return BallotCountReport({
    title,
    testId: 'ballot-count-report',
    electionDefinition,
    customFilter,
    scannerBatches,
    generatedAtTime,
    groupBy,
    cardCountsList,
  });
}

export interface BallotCountReportViewerProps {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  disabled: boolean;
  autoPreview: boolean;
}

export function BallotCountReportViewer({
  filter,
  groupBy,
  disabled: disabledFromProps,
  autoPreview,
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

  const cardCountsQuery = getCardCounts.useQuery(
    {
      filter,
      groupBy,
    },
    { enabled: !disabled && autoPreview }
  );
  const reportResultsAreFresh =
    cardCountsQuery.isSuccess && !cardCountsQuery.isStale;

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
    if (cardCountsQuery.data.length === 0) {
      return undefined;
    }

    return (
      <Report
        electionDefinition={assertDefined(electionDefinition)}
        filter={filter}
        groupBy={groupBy}
        cardCountsList={cardCountsQuery.data}
        generatedAtTime={new Date(cardCountsQuery.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        scannerBatches={scannerBatchesQuery.data ?? []}
      />
    );
  }, [
    disabled,
    reportResultsAreFresh,
    electionDefinition,
    filter,
    groupBy,
    cardCountsQuery.data,
    cardCountsQuery.dataUpdatedAt,
    isOfficialResults,
    scannerBatchesQuery.data,
  ]);
  previewReportRef.current = previewReport;
  const previewIsFresh = cardCountsQuery.isSuccess && !cardCountsQuery.isStale;
  const areQueryResultsEmpty =
    cardCountsQuery.isSuccess && cardCountsQuery.data.length === 0;

  async function refreshPreview() {
    setIsFetchingForPreview(true);
    await cardCountsQuery.refetch();
    setIsFetchingForPreview(false);
  }

  async function getFreshQueryResult(): Promise<typeof cardCountsQuery> {
    if (reportResultsAreFresh) {
      return cardCountsQuery;
    }

    return cardCountsQuery.refetch({ cancelRefetch: false });
  }

  async function printReport() {
    setProgressModalText('Generating Report');
    const queryResults = await getFreshQueryResult();
    assert(queryResults.isSuccess);
    const reportToPrint = (
      <Report
        electionDefinition={assertDefined(electionDefinition)}
        filter={filter}
        groupBy={groupBy}
        cardCountsList={queryResults.data}
        generatedAtTime={new Date(queryResults.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
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
    const queryResults = await getFreshQueryResult();
    assert(queryResults.isSuccess);
    const reportToSave = (
      <Report
        electionDefinition={assertDefined(electionDefinition)}
        filter={filter}
        groupBy={groupBy}
        cardCountsList={queryResults.data}
        generatedAtTime={new Date(queryResults.dataUpdatedAt)}
        isOfficialResults={isOfficialResults}
        scannerBatches={scannerBatchesQuery.data ?? []}
      />
    );

    return printElementToPdf(reportToSave);
  }

  const reportPdfFilename = generateBallotCountReportPdfFilename({
    election,
    filter,
    groupBy,
    isTestMode: castVoteRecordFileModeQuery.data === 'test',
    time: cardCountsQuery.dataUpdatedAt
      ? new Date(cardCountsQuery.dataUpdatedAt)
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
          fileType={FileType.BallotCountReport}
        />
        <ExportBallotCountReportCsvButton
          filter={filter}
          groupBy={groupBy}
          disabled={disabled || areQueryResultsEmpty}
        />
      </ExportActions>

      <Caption>
        <Icons.Info /> <Font weight="bold">Note:</Font> Printed reports may be
        paginated to more than one piece of paper.
      </Caption>
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
            {isFetchingForPreview && (
              <PreviewActionContainer>
                <LoadingTextContainer>
                  <Loading>Generating Report</Loading>
                </LoadingTextContainer>
              </PreviewActionContainer>
            )}
            {!isFetchingForPreview && !previewIsFresh && (
              <PreviewActionContainer>
                {previewReport ? (
                  <Button onPress={refreshPreview}>
                    <Icons.RotateRight /> Refresh Preview
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
