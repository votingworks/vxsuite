import React from 'react';

import { Main, MainChild, Screen, Prose } from '@votingworks/ui';

export function UnconfiguredScreen(): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Device Not Configured</h1>
            <p>Insert Election Admin card.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
