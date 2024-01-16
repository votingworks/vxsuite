import {
  ElectionDefinition,
  getPartySpecificElectionTitle,
  PartyId,
  PollsTransitionType,
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
import { CertificationSignatures } from './certification_signatures';

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

interface Props {
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  pollsTransition: PollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
}

export function PrecinctScannerReportHeader({
  electionDefinition,
  partyId,
  precinctSelection,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  reportPrintedTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const showTallies =
    pollsTransition === 'open_polls' || pollsTransition === 'close_polls';
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );
  const reportTitle = `${isLiveMode ? '' : 'Test '}${getPollsReportTitle(
    pollsTransition
  )} for ${precinctName}`;
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
            {formatFullDateTimeZone(DateTime.fromMillis(reportPrintedTime), {
              includeWeekday: false,
            })}
          </HeaderData>
          <HeaderData>
            <Font weight="bold">Scanner ID:</Font> {precinctScannerMachineId}
          </HeaderData>
        </p>
        <CertificationSignatures />
      </Header>
    </React.Fragment>
  );
}
