import { ElectionDefinition } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName as Feature,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Main, Screen, ElectionInfoBar, H1, P } from '@votingworks/ui';

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
}

export function UnconfiguredPrecinctScreen({
  electionDefinition,
  electionPackageHash,
}: Props): JSX.Element {
  if (!isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)) {
    return (
      <Screen>
        <Main centerChild>
          <H1>No Precinct Selected</H1>
          <P>Insert an election manager card to select a precinct.</P>
        </Main>
        <ElectionInfoBar
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
        />
      </Screen>
    );
  }

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
