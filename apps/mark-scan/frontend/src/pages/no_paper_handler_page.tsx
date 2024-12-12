import { Main, Screen, H1, P, appStrings } from '@votingworks/ui';

export function NoPaperHandlerPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <div>
          <H1>Internal Connection Problem</H1>
          <P>{appStrings.instructionsBmdAskForRestart()}</P>
        </div>
      </Main>
    </Screen>
  );
}
