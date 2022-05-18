import React from 'react';

import { Screen, Main } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';

export function LoadElectionScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>Not Configured</h1>
          <p>Insert Election Admin card.</p>
        </Prose>
      </Main>
      <MainNav />
    </Screen>
  );
}
