import { Main, Screen, H1, appStrings, P, Font } from '@votingworks/ui';

interface Props {
  stateMachineState: 'jam_cleared' | 'resetting_state_machine_after_jam';
}

export function JamClearedPage({ stateMachineState }: Props): JSX.Element {
  const statusMessage =
    stateMachineState === 'jam_cleared'
      ? appStrings.noteBmdHardwareResetting()
      : appStrings.noteBmdHardwareReset();

  return (
    <Screen white>
      <Main padded centerChild>
        <Font align="center" id="audiofocus">
          <H1>{appStrings.titleBmdJamClearedScreen()}</H1>
          <P>
            {statusMessage} {appStrings.noteBmdSessionRestart()}
          </P>
        </Font>
      </Main>
    </Screen>
  );
}
