import { Main, Screen, H1, P, Font, appStrings } from '@votingworks/ui';

export function LoadPaperPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Font align="center" id="audiofocus">
          <H1>{appStrings.titleBmdLoadPaperScreen()}</H1>
          <P>{appStrings.instructionsBmdLoadPaper()}</P>
        </Font>
      </Main>
    </Screen>
  );
}
