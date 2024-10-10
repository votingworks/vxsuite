import { Admin, Tabulation } from '@votingworks/types';
import { Button, Callout, H6 } from '@votingworks/ui';
import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isFilterEmpty,
  isGroupByEmpty,
} from '@votingworks/utils';
import {
  exportCdfElectionResultsReport,
  exportTallyReportCsv,
  exportTallyReportPdf,
  getTallyReportPreview,
  printTallyReport,
} from '../../api';
import { AppContext } from '../../contexts/app_context';
import { ExportActions, GenerateButtonWrapper } from './shared';
import { getTallyReportWarningText } from './tally_report_warnings';
import { PrintButton } from '../print_button';
import { PdfViewer } from './pdf_viewer';
import {
  generateCdfElectionResultsReportFilename,
  generateTallyReportCsvFilename,
  generateTallyReportPdfFilename,
} from '../../utils/reporting';
import { ExportFileButton } from './export_file_button';

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
  const exportReportPdfMutation = exportTallyReportPdf.useMutation();
  const exportReportCsvMutation = exportTallyReportCsv.useMutation();
  const exportCdfReportMutation = exportCdfElectionResultsReport.useMutation();

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

  const disableActionButtons =
    disabled ||
    !previewQuery.isSuccess ||
    previewQuery.data.warning?.type === 'no-reports-match-filter';
  const disablePdfExport =
    previewQuery.data?.warning?.type === 'content-too-large';

  return (
    <React.Fragment>
      <div style={{ padding: '1rem' }}>
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
            disabled={disableActionButtons || disablePdfExport}
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
          </PrintButton>
          <ExportFileButton
            buttonText="Export Report PDF"
            exportMutation={exportReportPdfMutation}
            exportParameters={{
              filter,
              groupBy,
              includeSignatureLines,
            }}
            generateFilename={(sharedFilenameProps) =>
              generateTallyReportPdfFilename({
                filter,
                groupBy,
                ...sharedFilenameProps,
              })
            }
            fileType="tally report"
            fileTypeTitle="Tally Report"
            disabled={disableActionButtons || disablePdfExport}
          />
          <ExportFileButton
            buttonText="Export Report CSV"
            exportMutation={exportReportCsvMutation}
            exportParameters={{
              filter,
              groupBy,
            }}
            generateFilename={(sharedFilenameProps) =>
              generateTallyReportCsvFilename({
                filter,
                groupBy,
                ...sharedFilenameProps,
              })
            }
            fileType="tally report"
            fileTypeTitle="Tally Report"
            disabled={disableActionButtons}
          />
          {isFullElectionReport && !disabled && (
            <ExportFileButton
              buttonText="Export CDF Report"
              exportMutation={exportCdfReportMutation}
              exportParameters={{}}
              generateFilename={(sharedFilenameProps) =>
                generateCdfElectionResultsReportFilename({
                  ...sharedFilenameProps,
                })
              }
              fileType="CDF election results report"
              fileTypeTitle="CDF Election Results Report"
              disabled={disableActionButtons}
            />
          )}
        </ExportActions>
        {previewQuery.data?.warning &&
          (() => {
            const text = getTallyReportWarningText({
              tallyReportWarning: previewQuery.data.warning,
              election,
            });
            return (
              <Callout
                color="warning"
                icon="Warning"
                style={{ marginTop: '1rem' }}
              >
                <div>
                  {text.header && (
                    <H6 style={{ lineHeight: 1 }}>{text.header}</H6>
                  )}
                  {text.body}
                </div>
              </Callout>
            );
          })()}
      </div>
      <PdfViewer
        pdfData={previewQuery.data?.pdf}
        loading={previewQuery.isFetching}
      />
    </React.Fragment>
  );
}
