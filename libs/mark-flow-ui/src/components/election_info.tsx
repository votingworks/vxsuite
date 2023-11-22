import React from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctSelection,
} from '@votingworks/types';

import {
  NoWrap,
  H1,
  P,
  Caption,
  Seal,
  electionStrings,
  appStrings,
  PrecinctSelectionName,
  PrimaryElectionTitlePrefix,
  NumberString,
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
  const { county, seal } = election;

  const partyPrimaryAdjective = (
    <React.Fragment>
      {ballotStyleId && (
        <PrimaryElectionTitlePrefix
          ballotStyleId={ballotStyleId}
          election={election}
        />
      )}{' '}
    </React.Fragment>
  );

  const title = (
    <React.Fragment>
      {partyPrimaryAdjective}
      {electionStrings.electionTitle(election)}
    </React.Fragment>
  );

  return (
    <Container>
      <Seal seal={seal} maxWidth="7rem" />
      <div>
        <H1>{title}</H1>
        <P>
          {electionStrings.electionDate(election)}
          <br />
          <Caption>
            {/* TODO(kofi): Use more language-agnostic delimiter (e.g. '|') or find way to translate commas. */}
            {precinctSelection && (
              <NoWrap>
                <PrecinctSelectionName
                  electionPrecincts={election.precincts}
                  precinctSelection={precinctSelection}
                />
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
                <NumberString value={contestCount} weight="bold" />
              </Caption>
            </React.Fragment>
          )}
        </P>
      </div>
    </Container>
  );
}
