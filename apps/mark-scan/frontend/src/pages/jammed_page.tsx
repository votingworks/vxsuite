import { Main, Screen, H1, Font, appStrings, P } from '@votingworks/ui';

export function JammedPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Font align="center" id="audiofocus">
          <H1>{appStrings.titleBmdJammedScreen()}</H1>
          <P>{appStrings.instructionsBmdPaperJam()}</P>
        </Font>
      </Main>
    </Screen>
  );
}
