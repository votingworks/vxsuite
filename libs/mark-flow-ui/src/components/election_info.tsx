import React from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctSelection,
} from '@votingworks/types';

import {
  H1,
  P,
  Caption,
  Seal,
  electionStrings,
  appStrings,
  PrecinctSelectionName,
  PrimaryElectionTitlePrefix,
  NumberString,
  useScreenInfo,
} from '@votingworks/ui';

const Container = styled.div`
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

  const screenInfo = useScreenInfo();

  const title = (
    <React.Fragment>
      {ballotStyleId && (
        <PrimaryElectionTitlePrefix
          ballotStyleId={ballotStyleId}
          election={election}
        />
      )}
      {electionStrings.electionTitle(election)}
    </React.Fragment>
  );

  return (
    <Container>
      <Seal
        seal={seal}
        maxWidth="7rem"
        style={{
          marginRight: screenInfo.isPortrait ? undefined : '1rem', // for horizontal layout
          marginBottom: screenInfo.isPortrait ? '0.5rem' : undefined, // for vertical layout
        }}
      />
      <div>
        <H1>{title}</H1>
        <P>{electionStrings.electionDate(election)}</P>
        <P>
          <Caption maxLines={4}>
            {/* TODO(kofi): Use more language-agnostic delimiter (e.g. '|') or find way to translate commas. */}
            {precinctSelection && (
              <span>
                <PrecinctSelectionName
                  electionPrecincts={election.precincts}
                  precinctSelection={precinctSelection}
                />
                ,{' '}
              </span>
            )}
            {electionStrings.countyName(county)},{' '}
            {electionStrings.stateName(election)}
          </Caption>
          {ballotStyleId && (
            <Caption>
              {appStrings.labelBallotStyle()}{' '}
              {electionStrings.ballotStyleId(ballotStyleId)}
            </Caption>
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
