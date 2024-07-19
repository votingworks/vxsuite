import React from 'react';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { assert } from '@votingworks/basics';
import { ReinsertedInvalidBallotScreen } from './pages/reinserted_invalid_ballot_screen';
import { WaitingForBallotReinsertionBallotScreen } from './pages/waiting_for_ballot_reinsertion_screen';
import { LoadingReinsertedBallotScreen } from './pages/loading_reinserted_ballot_screen';

export const BALLOT_REINSERTION_SCREENS: Readonly<
  Partial<Record<SimpleServerStatus, JSX.Element>>
> = {
  waiting_for_ballot_reinsertion: <WaitingForBallotReinsertionBallotScreen />,
  loading_reinserted_ballot: <LoadingReinsertedBallotScreen />,
  validating_reinserted_ballot: <LoadingReinsertedBallotScreen />,
  reinserted_invalid_ballot: <ReinsertedInvalidBallotScreen />,
};

export function isBallotReinsertionState(
  state?: SimpleServerStatus
): state is
  | 'waiting_for_ballot_reinsertion'
  | 'loading_reinserted_ballot'
  | 'validating_reinserted_ballot'
  | 'reinserted_invalid_ballot' {
  return !!state && !!BALLOT_REINSERTION_SCREENS[state];
}

export interface BallotReinsertionFlowProps {
  stateMachineState: SimpleServerStatus;
}

export function BallotReinsertionFlow(
  props: BallotReinsertionFlowProps
): React.ReactNode {
  const { stateMachineState } = props;

  assert(isBallotReinsertionState(stateMachineState));

  return BALLOT_REINSERTION_SCREENS[stateMachineState];
}
