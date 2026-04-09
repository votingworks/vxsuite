import {
  Font,
  H2,
  H3,
  H4,
  H6,
  P,
  PowerDownButton,
  SignedHashValidationApiClient,
  SignedHashValidationButton,
} from '@votingworks/ui';
import React from 'react';
import {
  BooleanEnvironmentVariableName as Feature,
  format,
  getPollsStateName,
  getPollTransitionsFromState,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  Election,
  getAllPrecinctsAndSplits,
  pollingPlaceFromElection,
  pollingPlaceMembers,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import { BallotStyleSelect, OnBallotStyleSelect } from './ballot_style_select';
import { ButtonGrid, VotingSession } from './elements';
import { UpdatePollsButton } from './update_polls_button';

export interface HeaderProps {
  ballotsPrintedCount: number;
}

/* istanbul ignore next - @preserve - currently tested via apps. */
export function SectionHeader(props: HeaderProps): JSX.Element {
  const { ballotsPrintedCount } = props;

  return (
    <React.Fragment>
      <H2 as="h1">Poll Worker Menu</H2>
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

/* istanbul ignore next - @preserve - currently tested via apps. */
export function SectionPollsState(props: SectionPollsStateProps): JSX.Element {
  const { pollsState, updatePollsState } = props;

  return (
    <React.Fragment>
      <H3>
        Polls: <Font weight="regular">{getPollsStateName(pollsState)}</Font>
      </H3>
      <ButtonGrid>
        {getPollTransitionsFromState(pollsState).map(
          (pollsTransition, index) => (
            <UpdatePollsButton
              pollsTransition={pollsTransition}
              updatePollsState={updatePollsState}
              isPrimaryButton={index === 0}
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
  pollingPlaceId?: string;
  precinctSelection?: PrecinctSelection;
  disabled?: boolean;
}

function getConfiguredPrecinctsAndSplits(p: {
  election: Election;
  pollingPlaceId?: string;
  precinctSelection?: PrecinctSelection;
}) {
  if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
    const selection = assertDefined(p.precinctSelection);

    const all = getAllPrecinctsAndSplits(p.election);
    if (selection.kind === 'AllPrecincts') return all;

    return all.filter(({ precinct }) => selection.precinctId === precinct.id);
  }

  assert(!!p.pollingPlaceId);
  const pollingPlace = pollingPlaceFromElection(p.election, p.pollingPlaceId);

  return pollingPlaceMembers(p.election, pollingPlace);
}

export function SectionSessionStart(
  props: SectionSessionStartProps
): JSX.Element {
  const {
    election,
    onChooseBallotStyle,
    pollingPlaceId,
    precinctSelection,
    disabled,
  } = props;

  return (
    <VotingSession>
      <H4 as="h2">Start a New Voting Session</H4>
      <BallotStyleSelect
        election={election}
        configuredPrecinctsAndSplits={getConfiguredPrecinctsAndSplits({
          election,
          pollingPlaceId,
          precinctSelection,
        })}
        onSelect={onChooseBallotStyle}
        disabled={disabled}
      />
    </VotingSession>
  );
}

interface SystemButtonsProps {
  apiClient: SignedHashValidationApiClient;
  includePowerButton?: boolean;
}

/* istanbul ignore next - @preserve - currently tested via apps. */
function SystemButtons({
  apiClient,
  includePowerButton = true,
}: SystemButtonsProps): JSX.Element {
  return (
    <ButtonGrid>
      <SignedHashValidationButton apiClient={apiClient} />
      {includePowerButton && <PowerDownButton icon="PowerOff" />}
    </ButtonGrid>
  );
}

export interface SectionSystemProps {
  apiClient: SignedHashValidationApiClient;
  /**
   * Whether to include the Power Down button. Defaults to true.
   */
  includePowerButton?: boolean;
}

/**
 * System section with H3 heading (for poll worker screen).
 */
/* istanbul ignore next - @preserve - currently tested via apps. */
export function SectionSystem(props: SectionSystemProps): JSX.Element {
  const { apiClient, includePowerButton } = props;

  return (
    <React.Fragment>
      <H3>System</H3>
      <SystemButtons
        apiClient={apiClient}
        includePowerButton={includePowerButton}
      />
    </React.Fragment>
  );
}

/**
 * System section with H6 heading (for admin screen).
 * Uses H6 visual styling while allowing semantic heading level to be set via `as` prop.
 */
/* istanbul ignore next - @preserve - currently tested via apps. */
export function H6SectionSystem(props: SectionSystemProps): JSX.Element {
  const { apiClient, includePowerButton } = props;

  return (
    <React.Fragment>
      <H6 as="h2">System</H6>
      <SystemButtons
        apiClient={apiClient}
        includePowerButton={includePowerButton}
      />
    </React.Fragment>
  );
}
