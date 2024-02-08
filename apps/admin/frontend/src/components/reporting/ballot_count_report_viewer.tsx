import { Button } from '@votingworks/ui';
import React from 'react';
import type { BallotCountReportSpec } from '@votingworks/admin-backend';
import {
  exportBallotCountReportCsv,
  exportBallotCountReportPdf,
  getBallotCountReportPreview,
  printBallotCountReport,
} from '../../api';
import { ExportActions, GenerateButtonWrapper, ReportWarning } from './shared';
import { getBallotCountReportWarningText } from './ballot_count_report_warnings';
import { PrintButton } from '../print_button';
import { PdfViewer } from './pdf_viewer';
import { ExportFileButton } from './export_file_button';
import {
  generateBallotCountReportCsvFilename,
  generateBallotCountReportPdfFilename,
} from '../../utils/reporting';

export type BallotCountReportViewerProps = BallotCountReportSpec & {
  disabled: boolean;
  autoGenerateReport: boolean;
};

export function BallotCountReportViewer({
  filter,
  groupBy,
  includeSheetCounts,
  disabled,
  autoGenerateReport,
}: BallotCountReportViewerProps): JSX.Element {
  const printReportMutation = printBallotCountReport.useMutation();
  const exportReportPdfMutation = exportBallotCountReportPdf.useMutation();
  const exportReportCsvMutation = exportBallotCountReportCsv.useMutation();

  const previewQuery = getBallotCountReportPreview.useQuery(
    {
      filter,
      groupBy,
      includeSheetCounts,
    },
    { enabled: !disabled && autoGenerateReport }
  );

  /**
   * No fetch has been attempted yet. The viewer must not be in autogenerate
   * mode, and the user hasn't pressed "Generate Report" yet.
   */
  const previewQueryNotAttempted =
    !previewQuery.isFetching && !previewQuery.isSuccess;

  const reportIsEmpty =
    previewQuery.isSuccess &&
    previewQuery.data.warning.type === 'no-reports-match-filter';

  const disableActionButtons =
    disabled || !previewQuery.isSuccess || reportIsEmpty;

  return (
    <React.Fragment>
      {!autoGenerateReport && (
        <GenerateButtonWrapper>
          <Button
            variant="primary"
            disabled={
              disabled || previewQuery.isSuccess || previewQuery.isFetching
            }
            onPress={() => previewQuery.refetch()}
          >
            Generate Report
          </Button>
        </GenerateButtonWrapper>
      )}
      <ExportActions>
        <PrintButton
          disabled={disableActionButtons}
          print={() =>
            printReportMutation.mutateAsync({
              filter,
              groupBy,
              includeSheetCounts,
            })
          }
          variant={autoGenerateReport ? 'primary' : undefined}
        >
          Print Report
        </PrintButton>
        <ExportFileButton
          buttonText="Export Report PDF"
          exportMutation={exportReportPdfMutation}
          exportParameters={{
            filter,
            groupBy,
            includeSheetCounts,
          }}
          generateFilename={(sharedFilenameProps) =>
            generateBallotCountReportPdfFilename({
              filter,
              groupBy,
              ...sharedFilenameProps,
            })
          }
          fileType="ballot count report"
          fileTypeTitle="Ballot Count Report"
          disabled={disableActionButtons}
        />
        <ExportFileButton
          buttonText="Export Report CSV"
          exportMutation={exportReportCsvMutation}
          exportParameters={{
            filter,
            groupBy,
            includeSheetCounts,
          }}
          generateFilename={(sharedFilenameProps) =>
            generateBallotCountReportCsvFilename({
              filter,
              groupBy,
              ...sharedFilenameProps,
            })
          }
          fileType="ballot count report"
          fileTypeTitle="Ballot Count Report"
          disabled={disableActionButtons}
        />
      </ExportActions>
      {previewQuery.isSuccess && (
        <ReportWarning
          text={getBallotCountReportWarningText({
            ballotCountReportWarning: previewQuery.data.warning,
          })}
        />
      )}
      <PdfViewer
        pdfData={previewQuery.isSuccess ? previewQuery.data.pdf : undefined}
        disabled={disabled || previewQueryNotAttempted}
      />
    </React.Fragment>
  );
}
