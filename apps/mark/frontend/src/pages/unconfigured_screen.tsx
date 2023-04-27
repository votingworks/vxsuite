import React from 'react';

import { Main, Screen, CenteredLargeProse, H1 } from '@votingworks/ui';

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
            <p>Insert Election Manager card to select a precinct.</p>
          ) : (
            <p>Insert Election Manager card to load an election definition.</p>
          )}
        </CenteredLargeProse>
      </Main>
    </Screen>
  );
}
