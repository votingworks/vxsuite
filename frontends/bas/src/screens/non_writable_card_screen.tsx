import React from 'react';

import { Screen, Main } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';
import { Button } from '../components/button';

interface Props {
  lockScreen: () => void;
}

export function NonWritableCardScreen({ lockScreen }: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>Non-Writable Card</h1>
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
