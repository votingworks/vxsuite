import {
  AnyContest,
  CandidateContest,
  Election,
  Tabulation,
} from '@votingworks/types';
import { ThemeProvider } from 'styled-components';
import { unique } from '@votingworks/basics';
import {
  ReportSection,
  tallyReportThemeFn,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestWriteInSummaryTable } from './contest_write_in_summary_table';

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
  isOfficialResults: boolean;
}

export function WriteInAdjudicationReport({
  election,
  electionWriteInSummary,
  generatedAtTime,
  isOfficialResults,
}: WriteInAdjudicationReportProps): JSX.Element {
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const allWriteInContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.allowWriteIns
  );

  // treating `undefined` as "none" here
  const relevantPartyIds = unique(allWriteInContests.map((c) => c.partyId));

  return (
    // must wrap in theme so it's available in printing environment
    <ThemeProvider theme={tallyReportThemeFn}>
      <TallyReport data-testid="write-in-tally-report">
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
            <ReportSection
              key={sectionKey}
              data-testid={`write-in-tally-report-${sectionKey}`}
            >
              <LogoMark />
              <h1>
                {statusPrefix} {electionTitle} Write-In Adjudication Report
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
            </ReportSection>
          );
        })}
      </TallyReport>
    </ThemeProvider>
  );
}
