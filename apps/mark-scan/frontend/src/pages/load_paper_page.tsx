import { Main, Screen, Text, H1 } from '@votingworks/ui';

export function LoadPaperPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Text center>
          <H1>Load Blank Ballot Sheet</H1>
          <p>
            Please feed one sheet of paper into the front input tray. The
            printer will automatically grab the paper when positioned correctly.
          </p>
        </Text>
      </Main>
    </Screen>
  );
}
