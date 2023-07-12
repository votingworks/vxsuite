import { Main, Screen, Text, H1, Button } from '@votingworks/ui';
import { parkPaper } from '../api';

export function LoadPaperPage(): JSX.Element {
  const parkPaperMutation = parkPaper.useMutation();

  function attemptParkPaper() {
    parkPaperMutation.mutate();
  }

  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Load Blank Ballot Sheet</H1>
          <Button onPress={attemptParkPaper}>Press to Load</Button>
        </Text>
      </Main>
    </Screen>
  );
}
