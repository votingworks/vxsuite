import { Main, Screen, Text, H1 } from '@votingworks/ui';

export function JammedPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Paper is Jammed</H1>
          <p>Please alert a poll worker to clear the jam.</p>
          <p>
            Poll Workers: remove the jammed paper, opening the printer cover or
            removing the ballot box if necessary. After the jam is cleared there
            will be a short delay as the hardware automatically restarts.
          </p>
        </Text>
      </Main>
    </Screen>
  );
}
