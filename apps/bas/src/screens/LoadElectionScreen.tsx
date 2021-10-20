import React from 'react';

import Prose from '../components/Prose';
import Main, { MainChild } from '../components/Main';
import MainNav from '../components/MainNav';
import Screen from '../components/Screen';

function LoadElectionScreen(): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Not Configured</h1>
            <p>Insert Election Admin card.</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav />
    </Screen>
  );
}

export default LoadElectionScreen;
