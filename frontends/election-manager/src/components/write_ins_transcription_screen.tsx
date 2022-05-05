import React from 'react';

import { Screen } from '@votingworks/ui';
import { Main, MainChild } from './main';

export function WriteInsTranscriptionScreen(): JSX.Element {
  return (
    <Screen>
      <Main padded>
        <MainChild>
          <h1>Fullscreen Modal Test</h1>
        </MainChild>
      </Main>
    </Screen>
  );
}
