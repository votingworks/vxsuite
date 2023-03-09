import React, { useState } from 'react';
import styled from 'styled-components';
import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PrecinctSelection,
} from '@votingworks/types';
import { ButtonList } from './button_list';
import { Button } from './button';
import { Text } from './text';
import { Caption, H1, H2, H3, P } from './typography';
import { SegmentedButton } from './segmented_button';

export interface VotingSessionProps {
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  appPrecinct: PrecinctSelection;
  electionDefinition: ElectionDefinition;
}

const StyledVotingSession = styled.div`
  margin: 30px 0 60px;
  border: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.foreground};
  border-radius: 1rem;
  padding: 30px 40px;
  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
`;

export function VotingSession(props: VotingSessionProps): JSX.Element {
  const { activateCardlessVoterSession, appPrecinct, electionDefinition } =
    props;

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === 'SinglePrecinct' ? appPrecinct.precinctId : undefined
    );

  const precinctBallotStyles = selectedCardlessVoterPrecinctId
    ? electionDefinition.election.ballotStyles.filter((bs) =>
        bs.precincts.includes(selectedCardlessVoterPrecinctId)
      )
    : [];

  return (
    <StyledVotingSession>
      <H1>Start a New Voting Session</H1>
      {appPrecinct.kind === 'AllPrecincts' && (
        <React.Fragment>
          <H3 as="h2">1. Select Voter’s Precinct</H3>
          <SegmentedButton
            onChange={setSelectedCardlessVoterPrecinctId}
            options={electionDefinition.election.precincts.map((p) => ({
              id: p.id,
              label: p.name,
            }))}
            selectedOptionId={selectedCardlessVoterPrecinctId}
            vertical
          />
        </React.Fragment>
      )}
      <H3 as="h2">
        {appPrecinct.kind === 'AllPrecincts' ? '2. ' : ''}Select Voter’s Ballot
        Style
      </H3>
      {selectedCardlessVoterPrecinctId ? (
        <SegmentedButton
          onChange={(ballotStyleId) =>
            activateCardlessVoterSession(
              selectedCardlessVoterPrecinctId,
              ballotStyleId
            )
          }
          options={precinctBallotStyles.map((b) => ({
            id: b.id,
            label: b.id,
            ariaLabel: `Activate Voter Session for Ballot Style ${b.id}`,
          }))}
        />
      ) : (
        <Caption italic>
          Select the voter’s precinct above to view ballot styles for the
          precinct.
        </Caption>
      )}
    </StyledVotingSession>
  );
}
