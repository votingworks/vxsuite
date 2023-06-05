import { IdlePage as MarkFlowIdlePage } from '@votingworks/mark-flow-ui';
import React, { useContext } from 'react';
import { BallotContext } from '../contexts/ballot_context';

export function IdlePage(): JSX.Element {
  const { endVoterSession, resetBallot } = useContext(BallotContext);

  async function reset() {
    await endVoterSession();
    resetBallot();
  }

  return <MarkFlowIdlePage onCountdownEnd={reset} />;
}
