import React from 'react';

import { Main, Screen, CenteredLargeProse } from '@votingworks/ui';

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
          <h1>VxMark is Not Configured</h1>
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
