/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  getPartyPrimaryAdjectiveFromBallotStyle,
  PrecinctSelection,
} from '@votingworks/types';
import { getPrecinctSelectionName, format } from '@votingworks/utils';

import { NoWrap, H1, P, Caption, Font, Seal } from '@votingworks/ui';
import pluralize from 'pluralize';

const Container = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;

  @media (orientation: portrait) {
    flex-direction: column;
  }
`;

interface Props {
  electionDefinition: ElectionDefinition;
  precinctSelection?: PrecinctSelection;
  ballotStyleId?: BallotStyleId;
  contestCount?: number;
}

export function ElectionInfo({
  electionDefinition,
  precinctSelection,
  ballotStyleId,
  contestCount,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const { title: t, state, county, date, seal, sealUrl } = election;
  const precinctName =
    precinctSelection &&
    getPrecinctSelectionName(election.precincts, precinctSelection);
  const partyPrimaryAdjective = ballotStyleId
    ? getPartyPrimaryAdjectiveFromBallotStyle({
        election,
        ballotStyleId,
      })
    : '';
  const title = `${partyPrimaryAdjective} ${t}`;
  const electionDate = format.localeLongDate(new Date(date));
  return (
    <Container>
      <Seal seal={seal} sealUrl={sealUrl} />
      <div>
        <H1>{title}</H1>
        <P
          aria-label={`${electionDate}. ${county.name}, ${state}. ${precinctName}.`}
        >
          <Font weight="bold">{electionDate}</Font>
          <br />
          <Caption>
            {precinctName && <NoWrap>{precinctName}, </NoWrap>}
            {county.name}, {state}
          </Caption>
          {ballotStyleId && (
            <React.Fragment>
              <br />
              <Caption>Ballot style: {ballotStyleId}</Caption>
            </React.Fragment>
          )}
          {contestCount && (
            <React.Fragment>
              <br />
              <Caption>
                Your ballot has{' '}
                <Font weight="bold">
                  {pluralize('contest', contestCount, true)}
                </Font>
                .
              </Caption>
            </React.Fragment>
          )}
        </P>
      </div>
    </Container>
  );
}
