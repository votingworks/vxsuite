import React from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

export function LoginPromptScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>VxScan is Not Configured</h1>
          <p>Insert Election Manager card to load an election definition.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
