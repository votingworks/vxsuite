import React from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  getPartyPrimaryAdjectiveFromBallotStyle,
  PrecinctSelection,
} from '@votingworks/types';
import { getPrecinctSelectionName, format } from '@votingworks/shared';

import { Prose, Text, NoWrap } from '@votingworks/shared-frontend';
import pluralize from 'pluralize';
import { Seal } from './seal';

const VerticalContainer = styled.div`
  display: block;
  margin: auto;
  div:first-child {
    margin: 0 auto 0.5rem;
  }
`;

const CenterinBlock = styled.div`
  display: flex;
  margin: 1.5rem 1rem 0;
`;

const HorizontalContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: auto;
  div:first-child {
    margin-right: 1rem;
    min-width: 5rem;
  }
`;

interface Props {
  electionDefinition: ElectionDefinition;
  precinctSelection?: PrecinctSelection;
  ballotStyleId?: BallotStyleId;
  horizontal?: boolean;
  ariaHidden?: boolean;
  contestCount?: number;
}

export function ElectionInfo({
  electionDefinition,
  precinctSelection,
  ballotStyleId,
  horizontal = false,
  ariaHidden = true,
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
  if (horizontal) {
    return (
      <CenterinBlock aria-hidden={ariaHidden} data-testid="election-info">
        <HorizontalContainer>
          <Seal seal={seal} sealUrl={sealUrl} />
          <Prose compact>
            <h5 aria-label={`${title}.`}>{title}</h5>
            <Text small>
              {electionDate}
              <br />
              <NoWrap>{county.name},</NoWrap> <NoWrap>{state}</NoWrap>
            </Text>
            {precinctName && (
              <Text small light>
                <NoWrap>
                  {precinctName}
                  {ballotStyleId && ', '}
                </NoWrap>
                {ballotStyleId && <NoWrap>ballot style {ballotStyleId}</NoWrap>}
              </Text>
            )}
          </Prose>
        </HorizontalContainer>
      </CenterinBlock>
    );
  }
  return (
    <VerticalContainer aria-hidden={ariaHidden}>
      <Seal seal={seal} sealUrl={sealUrl} />
      <Prose textCenter>
        <h1 aria-label={`${title}.`}>{title}</h1>
        <p
          aria-label={`${electionDate}. ${state}, ${county.name}. ${precinctName}.`}
        >
          {electionDate}
          <br />
          {state}
          <br />
          {county.name}
          {precinctName && <br />}
          {precinctName && (
            <strong>
              <NoWrap>{precinctName}</NoWrap>{' '}
              {ballotStyleId && <NoWrap>({ballotStyleId})</NoWrap>}
            </strong>
          )}
        </p>
        {contestCount && (
          <React.Fragment>
            <hr />
            <p>
              Your ballot has{' '}
              <strong>{pluralize('contest', contestCount, true)}</strong>.
            </p>
          </React.Fragment>
        )}
      </Prose>
    </VerticalContainer>
  );
}
