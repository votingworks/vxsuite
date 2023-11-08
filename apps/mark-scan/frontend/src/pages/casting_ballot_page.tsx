import {
  Main,
  Screen,
  InsertBallotImage,
  P,
  appStrings,
} from '@votingworks/ui';

export function CastingBallotPage(): JSX.Element {
  return (
    <Screen white>
      <Main centerChild padded id="audiofocus">
        <InsertBallotImage />
        <P>{appStrings.noteBmdCastingBallot()}</P>
      </Main>
    </Screen>
  );
}
