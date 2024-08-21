import { NavigationScreen } from '../../components/navigation_screen';
import {
  exportWriteInAdjudicationReportPdf,
  getWriteInAdjudicationReportPreview,
  printWriteInAdjudicationReport,
} from '../../api';
import {
  ExportActions,
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';
import { PrintButton } from '../../components/print_button';
import { PdfViewer } from '../../components/reporting/pdf_viewer';
import { ExportFileButton } from '../../components/reporting/export_file_button';
import { generateReportFilename } from '../../utils/reporting';

export const TITLE = 'Write-In Adjudication Report';

export function TallyWriteInReportScreen(): JSX.Element {
  const previewQuery = getWriteInAdjudicationReportPreview.useQuery();
  const printMutation = printWriteInAdjudicationReport.useMutation();
  const pdfExportMutation = exportWriteInAdjudicationReportPdf.useMutation();

  const isPreviewLoading = !previewQuery.isSuccess;

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <div style={{ padding: '1rem' }}>
          <ExportActions>
            <PrintButton
              disabled={isPreviewLoading}
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
              disabled={isPreviewLoading}
            />
          </ExportActions>
        </div>
        <PdfViewer pdfData={previewQuery.data} />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
