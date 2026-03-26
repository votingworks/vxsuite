import { NavigationScreen } from '../../components/navigation_screen';
import {
  exportVoterTurnoutReportPdf,
  getVoterTurnoutReportPreview,
  printVoterTurnoutReport,
} from '../../api';
import {
  ExportActions,
  reportParentRoutes,
  ReportScreenContainer,
  ReportWarning,
} from '../../components/reporting/shared';
import { PrintButton } from '../../components/print_button';
import { PdfViewer } from '../../components/reporting/pdf_viewer';
import { ExportFileButton } from '../../components/reporting/export_file_button';
import { generateReportFilename } from '../../utils/reporting';

export const TITLE = 'Voter Turnout Report';

export function VoterTurnoutReportScreen(): JSX.Element {
  const previewQuery = getVoterTurnoutReportPreview.useQuery();
  const printMutation = printVoterTurnoutReport.useMutation();
  const pdfExportMutation = exportVoterTurnoutReportPdf.useMutation();

  const isPreviewLoading = !previewQuery.isSuccess;
  const disablePdfExport =
    previewQuery.data?.warning?.type === 'content-too-large';

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <div style={{ padding: '1rem' }}>
          <ExportActions>
            <PrintButton
              disabled={isPreviewLoading || disablePdfExport}
              print={() => printMutation.mutateAsync()}
              variant="primary"
            >
              Print Report
            </PrintButton>{' '}
            <ExportFileButton
              buttonText="Export Report PDF"
              exportMutation={pdfExportMutation}
              exportParameters={{}}
              generateFilename={(sharedFilenameProps) =>
                generateReportFilename({
                  filter: {},
                  groupBy: {},
                  type: 'voter-turnout-report',
                  extension: 'pdf',
                  ...sharedFilenameProps,
                })
              }
              fileType="voter turnout report"
              fileTypeTitle="Voter Turnout Report"
              disabled={isPreviewLoading || disablePdfExport}
            />
          </ExportActions>
          {previewQuery.data?.warning && (
            <ReportWarning>This report is too large to export.</ReportWarning>
          )}
        </div>
        <PdfViewer
          loading={previewQuery.isFetching}
          pdfData={previewQuery.data?.pdf}
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
