import {
  AnyContest,
  CandidateContest,
  Election,
  Tabulation,
} from '@votingworks/types';
import { ThemeProvider } from 'styled-components';
import { unique } from '@votingworks/basics';
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
  election: Election;
  electionWriteInSummary: Tabulation.ElectionWriteInSummary;
  generatedAtTime: Date;
  isOfficial: boolean;
  isTest: boolean;
}

export function WriteInAdjudicationReport({
  election,
  electionWriteInSummary,
  generatedAtTime,
  isOfficial,
  isTest,
}: WriteInAdjudicationReportProps): JSX.Element {
  const allWriteInContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );

  // treating `undefined` as "none" here
  const relevantPartyIds = unique(allWriteInContests.map((c) => c.partyId));

  return (
    // must wrap in theme so it's available in printing environment
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid="write-in-tally-report">
        {relevantPartyIds.map((partyId) => {
          const partyLabel = election.parties.find((p) => p.id === partyId)
            ?.fullName;
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
                <ReportElectionInfo
                  election={election}
                  partyLabel={partyLabel}
                />
                <AdminReportMetadata generatedAtTime={generatedAtTime} />
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
      </PrintedReport>
    </ThemeProvider>
  );
}
