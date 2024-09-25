import {
  AnyContest,
  CandidateContest,
  ElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import { ThemeProvider } from 'styled-components';
import { unique } from '@votingworks/basics';
import { getPartyById } from '@votingworks/utils';
import {
  printedReportThemeFn,
  PrintedReport,
  TallyReportColumns,
} from './layout';
import { LogoMark } from '../logo_mark';
import { ContestWriteInSummaryTable } from './contest_write_in_summary_table';
import { prefixedTitle } from './utils';
import {
  ReportElectionInfo,
  ReportHeader,
  ReportSubtitle,
  ReportTitle,
  TestModeBanner,
} from './report_header';
import { AdminReportMetadata } from './admin_report_metadata';

function getEmptyContestWriteInSummary(
  contest: AnyContest
): Tabulation.ContestWriteInSummary {
  return {
    contestId: contest.id,
    totalTally: 0,
    pendingTally: 0,
    invalidTally: 0,
    candidateTallies: {},
  };
}

export interface WriteInAdjudicationReportProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  electionWriteInSummary: Tabulation.ElectionWriteInSummary;
  generatedAtTime: Date;
  isOfficial: boolean;
  isTest: boolean;
}

export function WriteInAdjudicationReport({
  electionDefinition,
  electionPackageHash,
  electionWriteInSummary,
  generatedAtTime,
  isOfficial,
  isTest,
}: WriteInAdjudicationReportProps): JSX.Element {
  const { election } = electionDefinition;
  const allWriteInContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );

  // treating `undefined` as "none" here
  const relevantPartyIds = unique(allWriteInContests.map((c) => c.partyId));

  return (
    // must wrap in theme so it's available in printing environment
    <ThemeProvider theme={printedReportThemeFn}>
      <div data-testid="write-in-tally-report">
        {relevantPartyIds.map((partyId) => {
          const partyLabel =
            partyId && getPartyById(electionDefinition, partyId).fullName;
          const partyWriteInContests = allWriteInContests.filter(
            (c) => c.partyId === partyId
          );
          const sectionKey = partyId || 'none';

          return (
            <PrintedReport
              key={sectionKey}
              data-testid={`write-in-tally-report-${sectionKey}`}
            >
              {isTest && <TestModeBanner />}
              <LogoMark />
              <ReportHeader>
                <ReportTitle>
                  {prefixedTitle({
                    isOfficial,
                    title: `Write‑In Adjudication Report`,
                  })}
                </ReportTitle>
                {partyLabel && <ReportSubtitle>{partyLabel}</ReportSubtitle>}
                <ReportElectionInfo election={election} />
                <AdminReportMetadata
                  generatedAtTime={generatedAtTime}
                  electionDefinition={electionDefinition}
                  electionPackageHash={electionPackageHash}
                />
              </ReportHeader>
              <TallyReportColumns>
                {partyWriteInContests.map((contest) => (
                  <ContestWriteInSummaryTable
                    key={contest.id}
                    election={election}
                    contestWriteInSummary={
                      electionWriteInSummary.contestWriteInSummaries[
                        contest.id
                      ] || getEmptyContestWriteInSummary(contest)
                    }
                  />
                ))}
              </TallyReportColumns>
            </PrintedReport>
          );
        })}
      </div>
    </ThemeProvider>
  );
}
