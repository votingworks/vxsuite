import {
  ElectionDefinition,
  ElectionRegisteredVotersCounts,
  PrecinctRegisteredVotersCountEntry,
  Tabulation,
} from '@votingworks/types';
import { getBallotCount } from '@votingworks/utils';
import styled, { ThemeProvider } from 'styled-components';
import React from 'react';
import { PrintedReport, printedReportThemeFn, reportColors } from './layout';
import { LogoMark } from '../logo_mark';
import { prefixedTitle } from './utils';
import {
  ReportElectionInfo,
  ReportHeader,
  ReportTitle,
  TestModeReportBanner,
} from './report_header';
import { ReportGeneratedMetadata } from './report_generated_metadata';

const EM_DASH = '—';

const TurnoutGrid = styled.div`
  width: 7.5in;
  display: grid;
  grid-template-columns: 1fr max-content max-content max-content;
  page-break-inside: auto;
  font-size: 14px;

  span {
    border-bottom: 0.5px solid #ddd;
    padding: 0.25em 0.5em 0.25em 0.25em;
    white-space: nowrap;
    overflow-x: hidden;
    text-overflow: ellipsis;
  }

  span:nth-child(4n + 2),
  span:nth-child(4n + 3),
  span:nth-child(4n + 4) {
    border-left: 1px solid #ddd;
    text-align: right;
  }

  /* row striping on data rows */
  span.striping:nth-child(8n + 1),
  span.striping:nth-child(8n + 2),
  span.striping:nth-child(8n + 3),
  span.striping:nth-child(8n + 4) {
    background-color: #f5f5f5;

    @media print {
      background-color: ${reportColors.container};
    }
  }

  .bold {
    font-weight: 500;
  }

  .header {
    font-weight: 600;
    border-bottom-width: 2px;
  }

  .thicker-top-border {
    border-top: 1.5px solid #ddd;
  }

  .no-bottom-border {
    border-bottom: none;
  }
`;

function sumRegisteredVoters(
  entry: PrecinctRegisteredVotersCountEntry
): number {
  if (typeof entry === 'number') return entry;
  return Object.values(entry.splits).reduce((acc, n) => acc + n, 0);
}

function formatTurnoutPercent(
  ballotsCast: number,
  registeredVoters: number
): string {
  if (registeredVoters === 0) return EM_DASH;
  return `${((ballotsCast / registeredVoters) * 100).toFixed(1)}%`;
}

export interface VoterTurnoutReportProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  isOfficial: boolean;
  isTest: boolean;
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  registeredVoterCounts: ElectionRegisteredVotersCounts;
  generatedAtTime: Date;
}

export function VoterTurnoutReport({
  electionDefinition,
  electionPackageHash,
  isOfficial,
  isTest,
  cardCountsList,
  registeredVoterCounts,
  generatedAtTime,
}: VoterTurnoutReportProps): JSX.Element {
  const { election } = electionDefinition;
  const title = prefixedTitle({ isOfficial, title: 'Voter Turnout Report' });

  const ballotsByPrecinct = new Map<string, number>();
  for (const group of cardCountsList) {
    if (group.precinctId) {
      ballotsByPrecinct.set(group.precinctId, getBallotCount(group));
    }
  }

  let totalBallotsCast = 0;
  let totalRegisteredVoters = 0;

  const rows = election.precincts.map((precinct) => {
    const ballotsCast = ballotsByPrecinct.get(precinct.id) ?? 0;
    const rv = sumRegisteredVoters(registeredVoterCounts[precinct.id]);
    totalBallotsCast += ballotsCast;
    totalRegisteredVoters += rv;
    return { precinct, ballotsCast, rv };
  });

  const totalRv = totalRegisteredVoters;

  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid="voter-turnout-report">
        {isTest && <TestModeReportBanner />}
        <LogoMark />
        <ReportHeader style={{ marginBottom: '1em' }}>
          <ReportTitle>{title}</ReportTitle>
          <ReportElectionInfo election={election} />
          <ReportGeneratedMetadata
            generatedAtTime={generatedAtTime}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
          />
        </ReportHeader>
        <TurnoutGrid data-testid="turnout-grid">
          <span className="header">Precinct</span>
          <span className="header">Ballots Cast</span>
          <span className="header">Registered Voters</span>
          <span className="header">Turnout</span>

          {rows.map(({ precinct, ballotsCast, rv }) => (
            <React.Fragment key={precinct.id}>
              <span className="striping">{precinct.name}</span>
              <span className="striping">{ballotsCast.toLocaleString()}</span>
              <span className="striping">{rv.toLocaleString()}</span>
              <span className="striping">
                {formatTurnoutPercent(ballotsCast, rv)}
              </span>
            </React.Fragment>
          ))}
          <span className="bold thicker-top-border no-bottom-border">
            Total
          </span>
          <span className="bold thicker-top-border no-bottom-border">
            {totalBallotsCast.toLocaleString()}
          </span>
          <span className="bold thicker-top-border no-bottom-border">
            {totalRv.toLocaleString()}
          </span>
          <span className="bold thicker-top-border no-bottom-border">
            {formatTurnoutPercent(totalBallotsCast, totalRv)}
          </span>
        </TurnoutGrid>
      </PrintedReport>
    </ThemeProvider>
  );
}
