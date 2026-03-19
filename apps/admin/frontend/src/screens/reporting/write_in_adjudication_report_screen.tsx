import { NavigationScreen } from '../../components/navigation_screen.js';
import {
  exportWriteInAdjudicationReportPdf,
  getWriteInAdjudicationReportPreview,
  printWriteInAdjudicationReport,
} from '../../api.js';
import {
  ExportActions,
  reportParentRoutes,
  ReportScreenContainer,
  ReportWarning,
} from '../../components/reporting/shared.js';
import { PrintButton } from '../../components/print_button.js';
import { PdfViewer } from '../../components/reporting/pdf_viewer.js';
import { ExportFileButton } from '../../components/reporting/export_file_button.js';
import { generateReportFilename } from '../../utils/reporting.js';

export const TITLE = 'Write-In Adjudication Report';

export function TallyWriteInReportScreen(): JSX.Element {
  const previewQuery = getWriteInAdjudicationReportPreview.useQuery();
  const printMutation = printWriteInAdjudicationReport.useMutation();
  const pdfExportMutation = exportWriteInAdjudicationReportPdf.useMutation();

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
                  type: 'write-in-adjudication-report',
                  extension: 'pdf',
                  ...sharedFilenameProps,
                })
              }
              fileType="write-in adjudication report"
              fileTypeTitle="Write-In Adjudication Report"
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
