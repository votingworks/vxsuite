import { Main, Screen, Text, H1, P, appStrings } from '@votingworks/ui';

export function NoPaperHandlerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <Text center>
          <H1>Internal Connection Problem</H1>
          <P>{appStrings.instructionsBmdAskForRestart()}</P>
        </Text>
      </Main>
    </Screen>
  );
}
