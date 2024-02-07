import { useContext } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  getWriteInAdjudicationReportPreview,
  printWriteInAdjudicationReport,
} from '../../api';
import {
  ExportActions,
  PreviewContainer,
  reportParentRoutes,
} from '../../components/reporting/shared';
import { PrintButton } from '../../components/print_button';
import { PdfViewer } from '../../components/reporting/pdf_viewer';
import { ExportWriteInAdjudicationReportPdfButton } from '../../components/reporting/export_wia_report_pdf_button';

export const TITLE = 'Write-In Adjudication Report';

export function TallyWriteInReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  const previewQuery = getWriteInAdjudicationReportPreview.useQuery();
  const printReportMutation = printWriteInAdjudicationReport.useMutation();

  const isPreviewLoading = !previewQuery.isSuccess;

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes}>
      <ExportActions>
        <PrintButton
          disabled={isPreviewLoading}
          print={() => printReportMutation.mutateAsync()}
          variant="primary"
        >
          Print Report
        </PrintButton>{' '}
        <ExportWriteInAdjudicationReportPdfButton disabled={isPreviewLoading} />
      </ExportActions>
      <PreviewContainer>
        <PdfViewer pdf={previewQuery.data} />
      </PreviewContainer>
    </NavigationScreen>
  );
}
