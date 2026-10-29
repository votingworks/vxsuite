import {
  H1,
  Main,
  Screen,
  PrintingBallotImage,
  appStrings,
  Font,
  ReadOnLoad,
} from '@votingworks/ui';

export function PrintPage(): JSX.Element {
  return (
    <Screen>
      <Main centerChild padded>
        <Font align="center">
          <PrintingBallotImage />
          <ReadOnLoad>
            <H1>{appStrings.titleBmdPrintScreen()}</H1>
          </ReadOnLoad>
        </Font>
      </Main>
    </Screen>
  );
}
