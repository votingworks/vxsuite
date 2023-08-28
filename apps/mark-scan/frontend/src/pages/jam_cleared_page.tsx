import { Main, Screen, Text, H1 } from '@votingworks/ui';

interface Props {
  stateMachineState: 'jam_cleared' | 'resetting_state_machine_after_jam';
}

export function JamClearedPage({ stateMachineState }: Props): JSX.Element {
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
