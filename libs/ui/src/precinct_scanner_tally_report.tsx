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

const Header = styled.div`
  & h1 {
    margin-top: 0;
    margin-bottom: 0.5em;
    font-size: 1.5em;
  }

  & p {
    margin-top: 0;
    margin-bottom: 0.25em;
  }
`;

const HeaderData = styled.span`
  margin-right: 1em;
  white-space: nowrap;
  &:last-child {
    margin-right: 0;
  }
`;

const ReportCertificationSignaturesContainer = styled.div`
  margin-top: 1em;
`;

const Signatures = styled.div`
  display: flex;
  & > div {
    flex: 1;
    margin-top: 1.5rem;
    margin-right: 0.3in;
    border-bottom: 1px solid #000000;
    padding-bottom: 1px;
    &::before {
      font-family: 'Noto Emoji', sans-serif;
      font-size: 1em;
      content: '✖️';
    }
    &:last-child {
      margin-right: 0;
    }
  }
`;

function ReportCertificationSignatures(): JSX.Element {
  return (
    <ReportCertificationSignaturesContainer>
      <p>
        <strong>Certification Signatures:</strong>{' '}
        <em>
          We, the undersigned, do hereby certify the election was conducted in
          accordance with the laws of the state.
        </em>
      </p>
      <Signatures>
        <div />
        <div />
        <div />
      </Signatures>
    </ReportCertificationSignaturesContainer>
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
            <p>
              <strong>{electionTitle}:</strong> {electionDate},{' '}
              {election.county.name}, {election.state}
            </p>
            <p>
              <HeaderData>
                <strong>Polls {isPollsOpen ? 'Opened' : 'Closed'}: </strong>
                {formatFullDateTimeZone(DateTime.fromMillis(pollsToggledTime), {
                  includeWeekday: false,
                })}
              </HeaderData>
              <HeaderData>
                <strong>Report Printed: </strong>
                {formatFullDateTimeZone(DateTime.fromMillis(currentTime), {
                  includeWeekday: false,
                })}
              </HeaderData>
              <HeaderData>
                <strong>Scanner ID:</strong> {precinctScannerMachineId}
              </HeaderData>
            </p>
            <ReportCertificationSignatures />
          </Header>

          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
            />
            <ContestTally
              election={election}
              scannedTally={tally}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
      </TallyReport>
    </PrintableContainer>
  );
}
