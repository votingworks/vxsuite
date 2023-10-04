import { Text, Main, Screen, H1, P } from '@votingworks/ui';

interface Props {
  message?: string;
}
export function PaperHandlerHardwareCheckDisabledScreen({
  message,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Text center>
          <H1>Hardware Check Has Been Disabled</H1>
          <P>
            The paper handler hardware check is disabled for development.
            Functionality that relies on hardware, like the paper load and print
            flows, will not work.
          </P>
          {message && <P>{message}</P>}
        </Text>
      </Main>
    </Screen>
  );
}
