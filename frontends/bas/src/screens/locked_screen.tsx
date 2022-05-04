import React from 'react';

import { Screen, Main, MainChild } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';

export function LockedScreen(): JSX.Element {
  return (
    <Screen flexDirection="column">
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Screen Locked</h1>
            <p>Insert Poll Worker card.</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav />
    </Screen>
  );
}
