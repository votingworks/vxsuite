import React from 'react';
import { Contests, Election, Tabulation } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ReportSection, TallyReport, TallyReportColumns } from './tally_report';
import { LogoMark } from '../logo_mark';
import { TallyReportMetadata } from './tally_report_metadata';
import { ContestResultsTable } from './contest_results_table';
import { Prose } from '../prose';

export interface AdminTallyReportProps {
  title: string;
  subtitle?: string;
  key?: string;
  election: Election;
  contests: Contests;
  scannedElectionResults: Tabulation.ElectionResults;
  manualElectionResults?: Tabulation.ManualElectionResults;
  generatedAtTime?: Date;
}

export function AdminTallyReport({
  title,
  subtitle,
  key,
  election,
  contests,
  scannedElectionResults,
  manualElectionResults,
  generatedAtTime = new Date(),
}: AdminTallyReportProps): JSX.Element {
  return (
    <TallyReport key={key} data-testid={key}>
      <ReportSection>
        <LogoMark />
        <Prose maxWidth={false}>
          <h1>{title}</h1>
          {subtitle && <h2>{subtitle}</h2>}
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
          />
        </Prose>
        <TallyReportColumns>
          {contests.map((contest) => {
            const scannedContestResults =
              scannedElectionResults.contestResults[contest.id];
            assert(
              scannedContestResults,
              `missing scanned results for contest ${contest.id}`
            );
            const manualContestResults =
              manualElectionResults?.contestResults[contest.id];
            return (
              <ContestResultsTable
                key={contest.id}
                election={election}
                contest={contest}
                scannedContestResults={scannedContestResults}
                manualContestResults={manualContestResults}
              />
            );
          })}
        </TallyReportColumns>
      </ReportSection>
    </TallyReport>
  );
}
