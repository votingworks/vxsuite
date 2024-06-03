import { Main, Screen, Text, H1, P } from '@votingworks/ui';

export function NoPaperHandlerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <Text center>
          <H1>No Connection to Printer-Scanner</H1>
          <P>
            Please restart the machine. If the problem persists, an internal
            connection may be loose.
          </P>
        </Text>
      </Main>
    </Screen>
  );
}
