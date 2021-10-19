import React from 'react';

import { Main, MainChild } from '@votingworks/ui';

import Prose from '../components/Prose';
import Screen from '../components/Screen';

const UnconfiguredScreen = (): JSX.Element => (
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

export default UnconfiguredScreen;
