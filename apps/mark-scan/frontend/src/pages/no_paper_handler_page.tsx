import { Main, Screen, Text, H1, P } from '@votingworks/ui';

export function NoPaperHandlerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <Text center>
          <H1>Internal Connection Problem</H1>
          <P>Ask a poll worker for help with restarting the machine.</P>
        </Text>
      </Main>
    </Screen>
  );
}
