import { Main, Screen, H1, P } from '@votingworks/ui';

export function SetupPrinterPage(): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <div>
          <H1>No Printer Detected</H1>
          <P>Please ask a poll worker to connect printer.</P>
        </div>
      </Main>
    </Screen>
  );
}
