import React, { useContext, useState, useMemo } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  TallyReportPreview,
  TallyReportMetadata,
  Button,
  printElement,
  printElementToPdf,
  LinkButton,
  P,
  Caption,
  Font,
  H2,
  WriteInAdjudicationReport,
  ReportPreviewLoading,
} from '@votingworks/ui';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';
import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import {
  SaveFrontendFileModal,
  FileType,
} from '../components/save_frontend_file_modal';
import { PrintButton } from '../components/print_button';
import { getElectionWriteInSummary } from '../api';

export function TallyWriteInReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;

  const writeInSummaryQuery = getElectionWriteInSummary.useQuery();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const report = useMemo(() => {
    if (!writeInSummaryQuery.isSuccess) return undefined;

    return (
      <WriteInAdjudicationReport
        election={election}
        electionWriteInSummary={writeInSummaryQuery.data}
        isOfficialResults={isOfficialResults}
        generatedAtTime={new Date(writeInSummaryQuery.dataUpdatedAt)}
      />
    );
  }, [
    election,
    isOfficialResults,
    writeInSummaryQuery.data,
    writeInSummaryQuery.dataUpdatedAt,
    writeInSummaryQuery.isSuccess,
  ]);

  async function printReport() {
    assert(report);

    try {
      await printElement(report, {
        sides: 'one-sided',
      });
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User printed the write-in adjudication report.`,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `Error in attempting to print the write-in adjudication report: ${error.message}`,
        disposition: 'failure',
        result: 'User shown error.',
      });
    }
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'write-in-adjudication-report',
    election,
    'full'
  );

  return (
    <React.Fragment>
      <NavigationScreen
        title={
          `${isOfficialResults ? 'Official' : 'Unofficial'} ` +
          `Write-In Adjudication Report`
        }
      >
        <TallyReportMetadata
          generatedAtTime={
            report ? new Date(writeInSummaryQuery.dataUpdatedAt) : undefined
          }
          election={election}
        />
        <P>
          <PrintButton disabled={!report} print={printReport} variant="primary">
            Print Report
          </PrintButton>{' '}
          {window.kiosk && (
            <Button disabled={!report} onPress={() => setIsSaveModalOpen(true)}>
              Save Report as PDF
            </Button>
          )}
        </P>
        <P>
          <LinkButton small to={routerPaths.reports}>
            Back to Reports
          </LinkButton>
        </P>

        <React.Fragment>
          <H2>Report Preview</H2>
          <Caption>
            <Font weight="bold">Note:</Font> Printed reports may be paginated to
            more than one piece of paper.
          </Caption>
          {report ? (
            <TallyReportPreview data-testid="report-preview">
              {report}
            </TallyReportPreview>
          ) : (
            <ReportPreviewLoading />
          )}
        </React.Fragment>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printElementToPdf(assertDefined(report))}
          defaultFilename={defaultReportFilename}
          fileType={FileType.WriteInAdjudicationReport}
        />
      )}
    </React.Fragment>
  );
}
