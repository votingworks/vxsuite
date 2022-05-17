import React from 'react';

import { Screen, Main } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';
import { Button } from '../components/button';

interface Props {
  lockScreen: () => void;
}

export function PollWorkerScreen({ lockScreen }: Props): JSX.Element {
  return (
    <Screen flexDirection="column">
      <Main centerChild>
        <Prose textCenter>
          <h1>Screen Unlocked</h1>
          <p>Remove Poll Worker card to continue.</p>
        </Prose>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  );
}
