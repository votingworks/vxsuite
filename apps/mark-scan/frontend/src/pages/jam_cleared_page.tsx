import { assert } from '@votingworks/basics';
import { AuthStatus } from '@votingworks/types/src/auth/inserted_smart_card_auth';
import { Main, Screen, Text, H1 } from '@votingworks/ui';
import { isPollWorkerAuth } from '@votingworks/utils';
import { useEffect } from 'react';
import { endCardlessVoterSession } from '../api';

interface Props {
  authStatus: AuthStatus;
  stateMachineState: 'jam_cleared' | 'resetting_state_machine_after_jam';
}

export function JamClearedPage({
  authStatus,
  stateMachineState,
}: Props): JSX.Element {
  const endCardlessVoterSessionMutation = endCardlessVoterSession.useMutation();

  useEffect(() => {
    assert(
      isPollWorkerAuth(authStatus),
      `Unexpected non-pollworker auth: ${JSON.stringify(authStatus)}`
    );
    // End cardless voter session if we haven't already
    if (
      stateMachineState === 'resetting_state_machine_after_jam' &&
      authStatus.cardlessVoterUser &&
      !endCardlessVoterSessionMutation.isLoading
    ) {
      endCardlessVoterSessionMutation.mutate(undefined);
    }
  }, [endCardlessVoterSessionMutation, authStatus, stateMachineState]);
  const statusMessage =
    stateMachineState === 'jam_cleared'
      ? 'The hardware is resetting'
      : 'The hardware has been reset';

  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Jam Cleared</H1>
          <p>{statusMessage}. Your voting session will restart shortly.</p>
        </Text>
      </Main>
    </Screen>
  );
}
