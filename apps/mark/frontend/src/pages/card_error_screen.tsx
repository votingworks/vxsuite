import { Main, Screen, Prose, RotateCardImage, H1, P } from '@votingworks/ui';

export function CardErrorScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <div>
          <RotateCardImage />
          <Prose textCenter>
            <H1>Card is Backwards</H1>
            <P>Remove the card, turn it around, and insert it again.</P>
          </Prose>
        </div>
      </Main>
    </Screen>
  );
}
