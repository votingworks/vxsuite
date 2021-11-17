import React from 'react';

import { Prose } from '../components/prose';
import { Main, MainChild } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Screen } from '../components/screen';

export function LockedScreen(): JSX.Element {
  return (
    <Screen>
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
