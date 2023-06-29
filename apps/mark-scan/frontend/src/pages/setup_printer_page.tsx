import { Main, Screen, Prose, H1, P } from '@votingworks/ui';

export function SetupPrinterPage(): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <Prose textCenter>
          <H1>No Printer Detected</H1>
          <P>Please ask a poll worker to connect printer.</P>
        </Prose>
      </Main>
    </Screen>
  );
}
