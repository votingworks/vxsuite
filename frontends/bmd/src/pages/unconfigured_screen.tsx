import React from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

export function UnconfiguredScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>Device Not Configured</h1>
          <p>Insert Election Admin card.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
