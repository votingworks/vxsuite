import React from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctSelection,
} from '@votingworks/types';
import { format, getPrecinctSelectionName } from '@votingworks/utils';

import {
  NoWrap,
  H1,
  P,
  Caption,
  Font,
  Seal,
  renderPrecinctSelectionName,
  electionStrings,
  appStrings,
  renderPrimaryElectionTitlePrefix,
} from '@votingworks/ui';

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
  const { state, county, date, seal } = election;

  const precinctName =
    precinctSelection &&
    getPrecinctSelectionName(election.precincts, precinctSelection);

  const partyPrimaryAdjective = (
    <React.Fragment>
      {ballotStyleId &&
        renderPrimaryElectionTitlePrefix(ballotStyleId, election)}{' '}
    </React.Fragment>
  );

  const title = (
    <React.Fragment>
      {partyPrimaryAdjective}
      {electionStrings.electionTitle(election)}
    </React.Fragment>
  );

  const electionDate = format.localeLongDate(new Date(date));

  return (
    <Container>
      <Seal seal={seal} />
      <div>
        <H1>{title}</H1>
        <P
          aria-label={`${electionDate}. ${county.name}, ${state}. ${precinctName}.`}
        >
          <Font weight="bold">{appStrings.date(new Date(date))}</Font>
          <br />
          <Caption>
            {/* TODO(kofi): Use more language-agnostic delimiter (e.g. '|') or find way to translate commas. */}
            {precinctSelection && (
              <NoWrap>
                {renderPrecinctSelectionName(
                  election.precincts,
                  precinctSelection
                )}
                ,{' '}
              </NoWrap>
            )}
            {electionStrings.countyName(county)},{' '}
            {electionStrings.stateName(election)}
          </Caption>
          {ballotStyleId && (
            <React.Fragment>
              <br />
              <Caption>
                {appStrings.labelBallotStyle()}{' '}
                {electionStrings.ballotStyleId(ballotStyleId)}
              </Caption>
            </React.Fragment>
          )}
          {contestCount && (
            <React.Fragment>
              <br />
              <Caption>
                {appStrings.labelNumBallotContests()}{' '}
                <Font weight="bold">{appStrings.number(contestCount)}</Font>
              </Caption>
            </React.Fragment>
          )}
        </P>
      </div>
    </Container>
  );
}
