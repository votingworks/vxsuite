import { Main, Screen, InsertBallotImage, P } from '@votingworks/ui';

export function CastingBallotPage(): JSX.Element {
  return (
    <Screen white>
      <Main centerChild padded>
        <InsertBallotImage />
        <P>Casting Ballot...</P>
      </Main>
    </Screen>
  );
}
