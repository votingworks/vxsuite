import React from 'react';

import { Main, Screen, CenteredLargeProse } from '@votingworks/ui';

export function LoginPromptScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <CenteredLargeProse>
          <h1>VxScan is not configured</h1>
          <p>Insert Election Manager card to load an election definition.</p>
        </CenteredLargeProse>
      </Main>
    </Screen>
  );
}
