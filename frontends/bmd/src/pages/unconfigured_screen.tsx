import React from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

export function UnconfiguredScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>VxMark is Not Configured</h1>
          <p>Insert Election Manager card to configure.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
