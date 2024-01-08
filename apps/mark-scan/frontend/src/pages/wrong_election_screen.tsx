import { Main, Screen, Prose, H1, P } from '@votingworks/ui';

export function WrongElectionScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <H1>Invalid Card Data</H1>
          <P>Card is not configured for this election.</P>
          <P>Please ask admin for assistance.</P>
        </Prose>
      </Main>
    </Screen>
  );
}
