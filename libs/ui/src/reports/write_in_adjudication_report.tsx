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
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestWriteInSummaryTable } from './contest_write_in_summary_table';
import { prefixedTitle } from './utils';

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
          const party = election.parties.find((p) => p.id === partyId);
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title;
          const partyWriteInContests = allWriteInContests.filter(
            (c) => c.partyId === partyId
          );
          const sectionKey = partyId || 'none';

          return (
            <PrintedReport
              key={sectionKey}
              data-testid={`write-in-tally-report-${sectionKey}`}
            >
              <LogoMark />
              <h1>
                {prefixedTitle({
                  isOfficial,
                  isTest,
                  title: `${electionTitle} Write‑In Adjudication Report`,
                })}
              </h1>
              <TallyReportMetadata
                generatedAtTime={generatedAtTime}
                election={election}
              />
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
