import { useContext, useMemo } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  printElement,
  printElementToPdf,
  P,
  WriteInAdjudicationReport,
} from '@votingworks/ui';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { FileType } from '../../components/save_frontend_file_modal';
import { PrintButton } from '../../components/print_button';
import {
  getCastVoteRecordFileMode,
  getElectionWriteInSummary,
} from '../../api';
import {
  ExportActions,
  PaginationNote,
  PreviewContainer,
  PreviewLoading,
  PreviewReportPages,
  ReportBackButton,
} from '../../components/reporting/shared';
import { ExportReportPdfButton } from '../../components/reporting/export_report_pdf_button';
import { generateReportFilename } from '../../utils/reporting';

export function TallyWriteInReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const writeInSummaryQuery = getElectionWriteInSummary.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';
  const report = useMemo(() => {
    if (!writeInSummaryQuery.isSuccess) return undefined;

    return (
      <WriteInAdjudicationReport
        election={election}
        electionWriteInSummary={writeInSummaryQuery.data}
        isOfficial={isOfficialResults}
        isTest={isTestMode}
        generatedAtTime={new Date(writeInSummaryQuery.dataUpdatedAt)}
      />
    );
  }, [
    election,
    isOfficialResults,
    isTestMode,
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

  const reportPdfFilename = generateReportFilename({
    election,
    filter: {},
    groupBy: {},
    type: 'write-in-adjudication-report',
    isTestMode: castVoteRecordFileModeQuery.data === 'test',
    isOfficialResults,
    extension: 'pdf',
    time: new Date(),
  });

  return (
    <NavigationScreen title="Write-In Adjudication Report">
      <P>
        <ReportBackButton />
      </P>
      <ExportActions>
        <PrintButton disabled={!report} print={printReport} variant="primary">
          Print Report
        </PrintButton>{' '}
        <ExportReportPdfButton
          electionDefinition={electionDefinition}
          generateReportPdf={() => printElementToPdf(assertDefined(report))}
          defaultFilename={reportPdfFilename}
          disabled={!report}
          fileType={FileType.WriteInAdjudicationReport}
        />
      </ExportActions>
      <PaginationNote />
      <PreviewContainer>
        {report ? (
          <PreviewReportPages>{report}</PreviewReportPages>
        ) : (
          <PreviewLoading />
        )}
      </PreviewContainer>
    </NavigationScreen>
  );
}
