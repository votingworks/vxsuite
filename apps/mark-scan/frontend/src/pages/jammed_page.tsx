import { Main, Screen, Text, H1 } from '@votingworks/ui';

export function JammedPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Paper is Jammed</H1>
          <p>
            Please alert a poll worker to clear the jam, opening the printer
            cover or ballot box if necessary.
          </p>
        </Text>
      </Main>
    </Screen>
  );
}
