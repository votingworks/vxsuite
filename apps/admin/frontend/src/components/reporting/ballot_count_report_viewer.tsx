import { Button } from '@votingworks/ui';
import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import type { BallotCountReportSpec } from '@votingworks/admin-backend';
import { getBallotCountReportPreview, printBallotCountReport } from '../../api';
import { AppContext } from '../../contexts/app_context';
import { ExportBallotCountReportCsvButton } from './export_ballot_count_report_csv_button';
import {
  ExportActions,
  GenerateButtonWrapper,
  PreviewContainer,
  ReportWarning,
} from './shared';
import { getBallotCountReportWarningText } from './ballot_count_report_warnings';
import { PrintButton } from '../print_button';
import { ExportBallotCountReportPdfButton } from './export_ballot_count_report_pdf_button';
import { PdfViewer } from './pdf_viewer';

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
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  const printReportMutation = printBallotCountReport.useMutation();

  const previewQuery = getBallotCountReportPreview.useQuery(
    {
      filter,
      groupBy,
      includeSheetCounts,
    },
    { enabled: !disabled && autoGenerateReport }
  );

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
        </PrintButton>{' '}
        <ExportBallotCountReportPdfButton
          filter={filter}
          groupBy={groupBy}
          includeSheetCounts={includeSheetCounts}
          disabled={disableActionButtons}
        />
        <ExportBallotCountReportCsvButton
          filter={filter}
          groupBy={groupBy}
          includeSheetCounts={includeSheetCounts}
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
      <PreviewContainer>
        <PdfViewer
          pdf={previewQuery.isSuccess ? previewQuery.data.pdf : undefined}
          disabled={!(previewQuery.isSuccess || previewQuery.isFetching)}
        />
      </PreviewContainer>
    </React.Fragment>
  );
}
