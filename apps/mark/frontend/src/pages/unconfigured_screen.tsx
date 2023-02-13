import React from 'react';

import { Main, Screen, Prose } from '@votingworks/shared-frontend';

interface Props {
  hasElectionDefinition: boolean;
}

export function UnconfiguredScreen({
  hasElectionDefinition,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>VxMark is Not Configured</h1>
          {hasElectionDefinition ? (
            <p>Insert Election Manager card to select a precinct.</p>
          ) : (
            <p>Insert Election Manager card to load an election definition.</p>
          )}
        </Prose>
      </Main>
    </Screen>
  );
}
