import { Main, Screen, Text, H1, P } from '@votingworks/ui';

export function RearPaperPathJammed(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Rear Paper Path Jammed</H1>
          <P>
            The printer has jammed while ejecting the ballot to the ballot box.
            Please alert a poll worker to remove the ballot box, clear the jam,
            and replace the ballot box.
          </P>
        </Text>
      </Main>
    </Screen>
  );
}
