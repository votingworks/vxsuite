import { useContext, useState } from 'react';
import { SearchSelect } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth } from '@votingworks/utils';
import {
  CandidateContest,
  Election,
  getContestDistrictName,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context.js';
import { NavigationScreen } from '../../components/navigation_screen.js';
import {
  ExportActions,
  reportParentRoutes,
  ReportScreenContainer,
  ReportWarning,
} from '../../components/reporting/shared.js';
import { PdfViewer } from '../../components/reporting/pdf_viewer.js';
import { PrintButton } from '../../components/print_button.js';
import { ExportFileButton } from '../../components/reporting/export_file_button.js';
import {
  exportWriteInImageReportPdf,
  getWriteInImageReportPreview,
  printWriteInImageReport,
} from '../../api.js';

export const TITLE = 'Single Contest Write-In Image Report';

const SelectContestContainer = styled.div`
  padding: 1rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;

  > span {
    white-space: nowrap;
  }
`;

/**
 * Concatenates the relevant attributes to ensure a unique label for each
 * contest since contests can have the same title.
 */
function constructContestLabel(
  contest: CandidateContest,
  election: Election
): string {
  const parts = [contest.title, getContestDistrictName(election, contest)];
  if (contest.partyId) {
    parts.push(
      getPartyAbbreviationByPartyId({
        partyId: contest.partyId,
        election,
      })
    );
  }
  if (contest.termDescription) {
    parts.push(contest.termDescription);
  }
  return parts.join(' · ');
}

export function WriteInImageReportScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const { election } = electionDefinition;

  const [contestId, setContestId] = useState<string>();

  const writeInContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );

  const selectedContest = writeInContests.find((c) => c.id === contestId);

  const previewQuery = getWriteInImageReportPreview.useQuery(contestId);
  const printMutation = printWriteInImageReport.useMutation();
  const exportMutation = exportWriteInImageReportPdf.useMutation();

  const isPreviewLoading = !!contestId && previewQuery.isFetching;
  // Clear pdfData while loading so the old contest's PDF is never shown
  // during the transition to a new contest.
  const pdfData = isPreviewLoading ? undefined : previewQuery.data?.pdf;
  const disablePdfExport =
    previewQuery.data?.warning?.type === 'content-too-large';
  const actionsDisabled = !contestId || isPreviewLoading || disablePdfExport;

  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>
        <SelectContestContainer>
          <SearchSelect
            isMulti={false}
            isSearchable
            value={contestId}
            options={writeInContests
              .map((contest) => ({
                value: contest.id,
                label: constructContestLabel(contest, election),
              }))
              .sort((o1, o2) => o1.label.localeCompare(o2.label))}
            onChange={(value) => setContestId(value)}
            aria-label="Select Contest"
            style={{ width: '30rem' }}
            placeholder="Select a contest..."
          />
        </SelectContestContainer>
        {contestId && (
          <div style={{ padding: '1rem' }}>
            <ExportActions>
              <PrintButton
                disabled={actionsDisabled}
                print={() => printMutation.mutateAsync({ contestId })}
                variant="primary"
              >
                Print Report
              </PrintButton>{' '}
              <ExportFileButton
                buttonText="Export Report PDF"
                exportMutation={exportMutation}
                exportParameters={{ contestId }}
                generateFilename={({ isTestMode, isOfficialResults, time }) => {
                  const prefix = isTestMode ? 'test-' : '';
                  const officiality = isOfficialResults
                    ? 'official'
                    : 'unofficial';
                  const contestSlug = (selectedContest?.title ?? contestId)
                    .toLowerCase()
                    .replace(/\s+/g, '-');
                  const timestamp = time
                    .toISOString()
                    .slice(0, 19)
                    .replace(/:/g, '-');
                  return `${prefix}${officiality}-write-in-image-report-${contestSlug}-${timestamp}.pdf`;
                }}
                fileType="write-in image report"
                fileTypeTitle="Write-In Image Report"
                disabled={actionsDisabled}
              />
            </ExportActions>
            {previewQuery.data?.warning && (
              <ReportWarning>This report is too large to export.</ReportWarning>
            )}
          </div>
        )}
        <PdfViewer
          key={contestId ?? 'no-contest'}
          loading={isPreviewLoading}
          pdfData={pdfData}
          renderMode="canvas"
        />
      </ReportScreenContainer>
    </NavigationScreen>
  );
}
