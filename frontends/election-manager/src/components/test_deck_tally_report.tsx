import React from 'react';
import {
  ContestTally,
  LogoMark,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  TallyReportMetadata,
  TallyReportTitle,
} from '@votingworks/ui';
import { Election, getPrecinctById, Tally } from '@votingworks/types';
import { filterTalliesByParty } from '@votingworks/utils';

export interface TestDeckTallyReportProps {
  election: Election;
  electionTally: Tally;
  precinctId?: string;
}

export function TestDeckTallyReport({
  election,
  electionTally,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  );

  const precinct = precinctId
    ? getPrecinctById({ election, precinctId })
    : undefined;

  const generatedAtTime = new Date();

  return (
    <TallyReport>
      {ballotStylePartyIds.map((partyId) => {
        const party = election.parties.find((p) => p.id === partyId);
        const electionTallyForParty = filterTalliesByParty({
          election,
          electionTally,
          party,
        });
        const electionTitle = `${party ? party.fullName : ''} ${
          election.title
        }`;
        return (
          <ReportSection key={partyId || 'no-party'}>
            <LogoMark />
            <div>
              <strong>Test Deck Tally Reports</strong> for {electionTitle}
            </div>
            <Prose maxWidth={false}>
              <TallyReportTitle
                style={{ marginBottom: '0.75em', marginTop: '0.25em' }}
              >
                {precinct ? 'Precinct' : ''} Tally Report for{' '}
                <strong>{precinct ? precinct.name : 'All Precincts'}</strong>
              </TallyReportTitle>
              <TallyReportMetadata
                generatedAtTime={generatedAtTime}
                election={election}
              />
            </Prose>
            <TallyReportColumns>
              <ContestTally
                election={election}
                electionTally={electionTallyForParty}
                externalTallies={[]}
              />
            </TallyReportColumns>
          </ReportSection>
        );
      })}
    </TallyReport>
  );
}
