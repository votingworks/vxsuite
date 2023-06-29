import { Main, Screen, CenteredLargeProse, H1, P } from '@votingworks/ui';

interface Props {
  hasElectionDefinition: boolean;
}

export function UnconfiguredScreen({
  hasElectionDefinition,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <CenteredLargeProse>
          <H1>VxMark is Not Configured</H1>
          {hasElectionDefinition ? (
            <P>Insert Election Manager card to select a precinct.</P>
          ) : (
            <P>Insert Election Manager card to load an election definition.</P>
          )}
        </CenteredLargeProse>
      </Main>
    </Screen>
  );
}
