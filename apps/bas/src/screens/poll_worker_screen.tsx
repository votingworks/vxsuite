import React from 'react';

import { Prose } from '../components/prose';
import { Main, MainChild } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Screen } from '../components/screen';
import { Button } from '../components/button';

interface Props {
  lockScreen: () => void;
}

export function PollWorkerScreen({ lockScreen }: Props): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Screen Unlocked</h1>
            <p>Remove Poll Worker card to continue.</p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  );
}
