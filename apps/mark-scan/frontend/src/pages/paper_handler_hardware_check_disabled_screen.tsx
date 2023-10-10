import { Text, Main, Screen, H1, P } from '@votingworks/ui';

interface Props {
  message?: string;
}
export function PaperHandlerHardwareCheckDisabledScreen({
  message,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <Text center>
          <H1>Hardware Check Disabled</H1>
        </Text>
        <Text>
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
