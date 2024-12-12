import { Main, Screen, Prose, H1, P, Font } from '@votingworks/ui';

export function SetupPowerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <Prose textCenter>
          <H1>
            No Power Detected <Font noWrap>and Battery is Low</Font>
          </H1>
          <P>
            Please ask a poll worker to plug-in the power cord for this machine.
          </P>
        </Prose>
      </Main>
    </Screen>
  );
}
