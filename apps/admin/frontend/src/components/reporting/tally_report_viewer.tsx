import { Admin, Tabulation } from '@votingworks/types';
import { Button } from '@votingworks/ui';
import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isFilterEmpty,
  isGroupByEmpty,
} from '@votingworks/utils';
import { getTallyReportPreview, printTallyReport } from '../../api';
import { AppContext } from '../../contexts/app_context';
import { ExportTallyReportCsvButton } from './export_tally_report_csv_button';
import {
  ExportActions,
  GenerateButtonWrapper,
  PreviewContainer,
  ReportWarning,
} from './shared';
import { getTallyReportWarningText } from './tally_report_warnings';
import { ExportCdfElectionResultsReportButton } from './export_cdf_election_results_report_button';
import { PrintButton } from '../print_button';
import { ExportTallyReportPdfButton } from './export_tally_report_pdf_button';
import { PdfViewer } from './pdf_viewer';

export interface TallyReportViewerProps {
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  disabled: boolean;
  autoGenerateReport: boolean;
}

export function TallyReportViewer({
  filter,
  groupBy,
  disabled,
  autoGenerateReport,
}: TallyReportViewerProps): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));

  const printReportMutation = printTallyReport.useMutation();

  const isFullElectionReport = isFilterEmpty(filter) && isGroupByEmpty(groupBy);
  const includeSignatureLines = isFullElectionReport;

  const previewQuery = getTallyReportPreview.useQuery(
    {
      filter,
      groupBy,
      includeSignatureLines,
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
              includeSignatureLines,
            })
          }
          variant={autoGenerateReport ? 'primary' : undefined}
        >
          Print Report
        </PrintButton>{' '}
        <ExportTallyReportPdfButton
          disabled={disableActionButtons}
          filter={filter}
          groupBy={groupBy}
          includeSignatureLines={includeSignatureLines}
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
      </ExportActions>
      {previewQuery.isSuccess && (
        <ReportWarning
          text={getTallyReportWarningText({
            tallyReportWarning: previewQuery.data.warning,
            election,
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
