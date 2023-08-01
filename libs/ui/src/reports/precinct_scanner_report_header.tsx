import {
  ElectionDefinition,
  getPartySpecificElectionTitle,
  PartyId,
  PollsTransition,
  PrecinctSelection,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getPollsReportTitle,
  getPollsTransitionActionPastTense,
  getPrecinctSelectionName,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { LogoMark } from '../logo_mark';
import { Font } from '../typography';

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
  & > p {
    font-size: 0.95em;
  }
`;

const Signatures = styled.div`
  display: flex;
  & > div {
    flex: 1;
    margin-top: 2em;
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
        <Font weight="bold">Certification Signatures:</Font> We, the
        undersigned, do hereby certify the election was conducted in accordance
        with the laws of the state.
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
  pollsTransition: PollsTransition;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
}

export function PrecinctScannerReportHeader({
  electionDefinition,
  partyId,
  precinctSelection,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  currentTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const showTallies =
    pollsTransition === 'open_polls' || pollsTransition === 'close_polls';
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );
  const reportTitle = `${
    isLiveMode ? 'Official' : 'TEST'
  } ${getPollsReportTitle(pollsTransition)} for ${precinctName}`;
  const electionDate = Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(election.date));

  const electionTitle = showTallies
    ? getPartySpecificElectionTitle(election, partyId)
    : election.title;

  return (
    <React.Fragment>
      <LogoMark />
      <Header>
        <h1>{reportTitle}</h1>
        <p>
          <Font weight="bold">{electionTitle}:</Font> {electionDate},{' '}
          {election.county.name}, {election.state}
        </p>
        <p>
          <HeaderData>
            <Font weight="bold">
              {getPollsTransitionActionPastTense(pollsTransition)}:{' '}
            </Font>
            {formatFullDateTimeZone(
              DateTime.fromMillis(pollsTransitionedTime),
              {
                includeWeekday: false,
              }
            )}
          </HeaderData>
          <HeaderData>
            <Font weight="bold">Report Printed: </Font>
            {formatFullDateTimeZone(DateTime.fromMillis(currentTime), {
              includeWeekday: false,
            })}
          </HeaderData>
          <HeaderData>
            <Font weight="bold">Scanner ID:</Font> {precinctScannerMachineId}
          </HeaderData>
        </p>
        <ReportCertificationSignatures />
      </Header>
    </React.Fragment>
  );
}
