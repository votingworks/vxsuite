/* istanbul ignore file - placeholder component that will change */
import { Main, Screen, Text, H1, P } from '@votingworks/ui';

export function ValidateBallotPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Please Validate Your Ballot</H1>
          <P>
            Please confirm the selections on your printed ballot are correct.
          </P>
        </Text>
      </Main>
    </Screen>
  );
}
