import {
  ElectionDefinition,
  PartyId,
  PrecinctSelection,
  Tally,
} from '@votingworks/types';
import {
  format,
  formatFullDateTimeZone,
  getPrecinctSelectionName,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { ContestTally } from './contest_tally';
import { LogoMark } from './logo_mark';
import {
  PrintableContainer,
  ReportSection,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { TallyReportSummary } from './tally_report_summary';
import { Text } from './text';

const Header = styled.div`
  margin-bottom: 0.75em;

  & h1 {
    margin-top: 0;
    margin-bottom: 0.5em;
    font-size: 1.5em;
  }

  & h2 {
    margin-top: 0;
    margin-bottom: 0.15em;
    font-size: 1.25em;
  }

  & p {
    margin-top: 0;
    margin-bottom: 0.5em;
  }
`;

const SignatureContainer = styled.div`
  margin: 0.75em;
  & p {
    margin: 0;
  }
`;

const SignatureLine = styled.div`
  display: flex;
  justify-content: space-around;
  margin-top: 0.75em;
`;

const SignatureSpace = styled.span`
  border-bottom: 1px solid #000000;
  width: 25%;
  &::before {
    font-family: 'Noto Emoji', sans-serif;
    content: '⨉';
  }
`;

function SignatureArea(): JSX.Element {
  return (
    <SignatureContainer>
      <Text small as="p">
        Certification Signatures:{' '}
        <strong>
          <em>
            We, the undersigned, do hereby certify the election was conducted in
            accordance with the laws of the state.
          </em>
        </strong>
      </Text>
      <SignatureLine>
        <SignatureSpace />
        <SignatureSpace />
        <SignatureSpace />
      </SignatureLine>
    </SignatureContainer>
  );
}

interface Props {
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  tally: Tally;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  pollsToggledTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
}

export function PrecinctScannerTallyReport({
  electionDefinition,
  partyId,
  precinctSelection,
  tally,
  isPollsOpen,
  isLiveMode,
  pollsToggledTime,
  currentTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined;
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );
  const reportTitle = `${isLiveMode ? 'Official' : 'TEST'} Polls ${
    isPollsOpen ? 'Opened' : 'Closed'
  } Report for ${precinctName}`;
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));

  const party = election.parties.find((p) => p.id === partyId);
  const electionTitle = party
    ? `${party.fullName} ${election.title}`
    : election.title;

  return (
    <PrintableContainer data-testid={`tally-report-${partyId}-${precinctId}`}>
      <TallyReport>
        <ReportSection>
          <LogoMark />
          <Header>
            <h1>{reportTitle}</h1>
            <h2>{electionTitle}</h2>
            <p>
              {electionDate}, {election.county.name}, {election.state}
            </p>
            <Text small as="p">
              Polls {isPollsOpen ? 'opened' : 'closed'} on{' '}
              {formatFullDateTimeZone(DateTime.fromMillis(pollsToggledTime), {
                includeWeekday: false,
              })}
              . Report printed on{' '}
              {formatFullDateTimeZone(DateTime.fromMillis(currentTime), {
                includeWeekday: false,
              })}
              . <strong>Scanner ID:</strong> {precinctScannerMachineId}
            </Text>
            <SignatureArea />
          </Header>

          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
            />
            <ContestTally
              election={election}
              electionTally={tally}
              externalTallies={[]}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
      </TallyReport>
    </PrintableContainer>
  );
}
