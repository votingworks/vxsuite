import { Main, Screen, H1, P, Font } from '@votingworks/ui';

export function PaperHandlerHardwareCheckDisabledScreen(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <H1>Hardware Check Disabled</H1>
        <Font align="left">
          <P>
            The paper handler hardware check is disabled for development. Some
            hardware flows may be unsupported.
          </P>
          <P>Remove the poll worker card to continue.</P>
        </Font>
      </Main>
    </Screen>
  );
}
