import { Main, Screen, H1, P, Font } from '@votingworks/ui';

export function SetupPowerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <div>
          <H1>
            No Power Detected <Font noWrap>and Battery is Low</Font>
          </H1>
          <P>
            Please ask a poll worker to plug-in the power cord for this machine.
          </P>
        </div>
      </Main>
    </Screen>
  );
}
