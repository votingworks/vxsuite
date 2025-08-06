/* istanbul ignore file - @preserve - currently tested via apps. */

import {
  Font,
  H2,
  H4,
  P,
  SignedHashValidationApiClient,
  SignedHashValidationButton,
  TestModeCallout,
} from '@votingworks/ui';
import React from 'react';
import {
  format,
  getPollsStateName,
  getPollTransitionsFromState,
} from '@votingworks/utils';
import {
  Election,
  getAllPrecinctsAndSplits,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { BallotStyleSelect, OnBallotStyleSelect } from './ballot_style_select';
import { ButtonGrid, VotingSession } from './elements';
import { UpdatePollsButton } from './update_polls_button';

export interface HeaderProps {
  ballotsPrintedCount: number;
  liveMode: boolean;
}

export function SectionHeader(props: HeaderProps): JSX.Element {
  const { ballotsPrintedCount, liveMode: isLiveMode } = props;

  return (
    <React.Fragment>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
        }}
      >
        <H2 as="h1">Poll Worker Menu</H2>
        {!isLiveMode && <TestModeCallout />}
      </div>
      <P>Remove the poll worker card to leave this screen.</P>
      <P style={{ fontSize: '1.2em' }}>
        <Font weight="bold">Ballots Printed:</Font>{' '}
        {format.count(ballotsPrintedCount)}
      </P>
    </React.Fragment>
  );
}

export interface SectionPollsStateProps {
  pollsState: PollsState;
  updatePollsState: (pollsState: PollsState) => void;
}

export function SectionPollsState(props: SectionPollsStateProps): JSX.Element {
  const { pollsState, updatePollsState } = props;

  return (
    <React.Fragment>
      <H4 as="h2">
        Polls: <Font weight="regular">{getPollsStateName(pollsState)}</Font>
      </H4>
      <ButtonGrid>
        {getPollTransitionsFromState(pollsState).map(
          (pollsTransition, index) => (
            <UpdatePollsButton
              pollsTransition={pollsTransition}
              updatePollsState={updatePollsState}
              isPrimaryButton={pollsState !== 'polls_open' && index === 0}
              key={`${pollsTransition}-button`}
            />
          )
        )}
      </ButtonGrid>
    </React.Fragment>
  );
}

export interface SectionSessionStartProps {
  election: Election;
  onChooseBallotStyle: OnBallotStyleSelect;
  precinctSelection: PrecinctSelection;
}

function getConfiguredPrecinctsAndSplits(
  election: Election,
  selection: PrecinctSelection
) {
  const all = getAllPrecinctsAndSplits(election);
  if (selection.kind === 'AllPrecincts') return all;

  return all.filter(({ precinct }) => selection.precinctId === precinct.id);
}

export function SectionSessionStart(
  props: SectionSessionStartProps
): JSX.Element {
  const { election, onChooseBallotStyle, precinctSelection } = props;

  return (
    <VotingSession>
      <H4 as="h2">Start a New Voting Session</H4>
      <BallotStyleSelect
        election={election}
        configuredPrecinctsAndSplits={getConfiguredPrecinctsAndSplits(
          election,
          precinctSelection
        )}
        onSelect={onChooseBallotStyle}
      />
    </VotingSession>
  );
}

export interface SectionSystemProps {
  additionalActions?: React.ReactNode;
  apiClient: SignedHashValidationApiClient;
}

export function SectionSystem(props: SectionSystemProps): JSX.Element {
  const { additionalActions, apiClient } = props;

  return (
    <React.Fragment>
      <H4 as="h2">System</H4>
      <ButtonGrid>
        <SignedHashValidationButton apiClient={apiClient} />
        {additionalActions}
      </ButtonGrid>
    </React.Fragment>
  );
}
