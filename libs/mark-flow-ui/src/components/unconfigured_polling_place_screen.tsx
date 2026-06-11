import { ElectionDefinition } from '@votingworks/types';
import { Main, Screen, ElectionInfoBar, H1, P } from '@votingworks/ui';

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
}

export function UnconfiguredPollingPlaceScreen({
  electionDefinition,
  electionPackageHash,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <H1>No Polling Place Selected</H1>
        <P>Insert an election manager card to select a polling place.</P>
      </Main>
      <ElectionInfoBar
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
      />
    </Screen>
  );
}
