import {
  AnyContest,
  CandidateContest,
  Election,
  Tabulation,
} from '@votingworks/types';
import styled, { ThemeProvider } from 'styled-components';
import { unique } from '@votingworks/basics';
import { ReportSection, TallyReport, TallyReportColumns } from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestWriteInSummaryTable } from './contest_write_in_summary_table';
import { makeTheme } from '../themes/make_theme';
import { tableBorderColor } from '../table';

const ZeroList = styled.div`
  break-inside: avoid;
  h3 {
    margin-bottom: 0.2rem;
    border-bottom: 1px solid ${tableBorderColor};
    padding-bottom: 0.1rem;
  }
  ul {
    margin: 0;
    margin-left: 0.1rem;
    padding-left: 0;
    list-style: none;
  }
  li {
    margin: 0.3rem 0;
  }
`;

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
    <ThemeProvider theme={makeTheme({ sizeMode: 's' })}>
      <TallyReport data-testid="write-in-tally-report">
        {relevantPartyIds.map((partyId) => {
          const party = election.parties.find((p) => p.id === partyId);
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title;
          const partyWriteInContests = allWriteInContests.filter(
            (c) => c.partyId === partyId
          );
          const nonZeroWriteInContests: AnyContest[] = [];
          const zeroWriteInContests: AnyContest[] = [];
          for (const contest of partyWriteInContests) {
            const contestWriteInSummary =
              electionWriteInSummary.contestWriteInSummaries[contest.id];
            if (contestWriteInSummary && contestWriteInSummary.totalTally > 0) {
              nonZeroWriteInContests.push(contest);
            } else {
              zeroWriteInContests.push(contest);
            }
          }
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
                {nonZeroWriteInContests.map((contest) => (
                  <ContestWriteInSummaryTable
                    key={contest.id}
                    election={election}
                    contestWriteInSummary={
                      electionWriteInSummary.contestWriteInSummaries[contest.id]
                    }
                  />
                ))}
                {zeroWriteInContests.length > 0 && (
                  <ZeroList>
                    <h3>Contests With Zero Write-Ins</h3>
                    <ul>
                      {zeroWriteInContests.map((contest) => (
                        <li key={contest.id}>{contest.title}</li>
                      ))}
                    </ul>
                  </ZeroList>
                )}
              </TallyReportColumns>
            </ReportSection>
          );
        })}
      </TallyReport>
    </ThemeProvider>
  );
}
