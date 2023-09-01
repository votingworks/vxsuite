import { Main, Screen, Text, H1, P } from '@votingworks/ui';

export function BallotBoxDetached(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Ballot Box Detached</H1>
          <P>
            The ballot box is detached. Please alert a poll worker to reattach
            the ballot box.
          </P>
        </Text>
      </Main>
    </Screen>
  );
}
