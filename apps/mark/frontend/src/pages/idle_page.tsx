import { IdlePage as MarkFlowIdlePage } from '@votingworks/mark-flow-ui';
import { useCallback, useContext } from 'react';
import { BallotContext } from '../contexts/ballot_context';
import { endCardlessVoterSession } from '../api';

export function IdlePage(): JSX.Element {
  const endCardlessVoterSessionMutation = endCardlessVoterSession.useMutation();
  // mutate function, unlike mutation object, does not change identity each render
  const endCardlessVoterSessionMutate = endCardlessVoterSessionMutation.mutate;
  const { resetBallot } = useContext(BallotContext);

  const reset = useCallback(() => {
    endCardlessVoterSessionMutate(undefined, {
      onSuccess: () => resetBallot(),
    });
  }, [endCardlessVoterSessionMutate, resetBallot]);

  return <MarkFlowIdlePage onCountdownEnd={reset} />;
}
